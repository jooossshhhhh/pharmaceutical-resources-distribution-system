do $$
begin
    if not exists (
        select 1
        from pg_type
        where typname = 'facility_change_request_status'
    ) then
        create type facility_change_request_status as enum (
            'PENDING',
            'APPROVED',
            'REJECTED',
            'CANCELLED'
        );
    end if;
end $$;

create table if not exists public.profile_facility_change_requests (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    current_facility_id uuid references public.facilities(id),
    requested_facility_id uuid not null references public.facilities(id),
    reason text,
    status facility_change_request_status not null default 'PENDING',
    reviewed_by uuid references public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profile_facility_change_different_facility
        check (current_facility_id is null or current_facility_id <> requested_facility_id)
);

create unique index if not exists idx_profile_facility_change_one_pending
on public.profile_facility_change_requests(profile_id)
where status = 'PENDING';

create index if not exists idx_profile_facility_change_status
on public.profile_facility_change_requests(status);

create index if not exists idx_profile_facility_change_profile
on public.profile_facility_change_requests(profile_id);

alter table public.profile_facility_change_requests enable row level security;

grant select, insert, update on public.profile_facility_change_requests to authenticated;

create policy "users_can_view_own_facility_change_requests"
on public.profile_facility_change_requests
for select
to authenticated
using (profile_id = auth.uid());

create policy "users_can_insert_own_facility_change_requests"
on public.profile_facility_change_requests
for insert
to authenticated
with check (
    profile_id = auth.uid()
    and status = 'PENDING'
    and reviewed_by is null
    and reviewed_at is null
);

create policy "pharma_ii_can_view_facility_change_requests"
on public.profile_facility_change_requests
for select
to authenticated
using (is_pharma_ii());

create policy "pharma_ii_can_update_facility_change_requests"
on public.profile_facility_change_requests
for update
to authenticated
using (is_pharma_ii())
with check (is_pharma_ii());

create or replace function public.update_own_profile_contact(
    p_first_name text,
    p_last_name text,
    p_email text default null,
    p_phone_number text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if nullif(trim(p_first_name), '') is null then
        raise exception 'First name is required';
    end if;

    if nullif(trim(p_last_name), '') is null then
        raise exception 'Last name is required';
    end if;

    update public.profiles
    set
        first_name = trim(p_first_name),
        last_name = trim(p_last_name),
        email = nullif(trim(coalesce(p_email, '')), ''),
        phone_number = nullif(trim(coalesce(p_phone_number, '')), ''),
        updated_at = now()
    where id = auth.uid();

    if not found then
        raise exception 'Profile not found';
    end if;
end;
$$;

revoke all on function public.update_own_profile_contact(text, text, text, text) from public;
grant execute on function public.update_own_profile_contact(text, text, text, text) to authenticated;;
