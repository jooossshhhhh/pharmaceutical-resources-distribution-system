create or replace function public.get_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id
    from public.profiles
    where (
        auth.jwt()->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and id = (auth.jwt()->>'sub')::uuid
    )
    or (
        firebase_uid is not null
        and firebase_uid = auth.jwt()->>'sub'
    )
    limit 1;
$$;

create or replace function public.is_pharma_ii()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = public.get_current_profile_id()
        and role = 'PHARMA_II'
        and status = 'ACTIVE'
    );
$$;

create or replace function public.is_pharma_i()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = public.get_current_profile_id()
        and role = 'PHARMA_I'
        and status = 'ACTIVE'
    );
$$;

create or replace function public.is_bhw()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = public.get_current_profile_id()
        and role = 'BHW'
        and status = 'ACTIVE'
    );
$$;

create or replace function public.get_user_facility()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select facility_id
    from public.profiles
    where id = public.get_current_profile_id();
$$;

drop policy if exists "users_can_view_own_profile" on public.profiles;
drop policy if exists "pharma_ii_can_view_all_profiles" on public.profiles;
drop policy if exists "pharma_ii_can_update_profiles" on public.profiles;

create policy "users_can_view_own_profile"
on public.profiles
for select
to authenticated
using (
    id = public.get_current_profile_id()
);

create policy "pharma_ii_can_view_all_profiles"
on public.profiles
for select
to authenticated
using (
    public.is_pharma_ii()
);

create policy "pharma_ii_can_update_profiles"
on public.profiles
for update
to authenticated
using (
    public.is_pharma_ii()
)
with check (
    public.is_pharma_ii()
);

drop policy if exists "users_can_view_own_notifications" on public.notifications;
drop policy if exists "users_can_update_own_notifications" on public.notifications;
drop policy if exists "pharma_ii_can_insert_notifications" on public.notifications;

create policy "users_can_view_own_notifications"
on public.notifications
for select
to authenticated
using (
    user_id = public.get_current_profile_id()
);

create policy "users_can_update_own_notifications"
on public.notifications
for update
to authenticated
using (
    user_id = public.get_current_profile_id()
)
with check (
    user_id = public.get_current_profile_id()
);

create policy "pharma_ii_can_insert_notifications"
on public.notifications
for insert
to authenticated
with check (
    public.is_pharma_ii()
);;
