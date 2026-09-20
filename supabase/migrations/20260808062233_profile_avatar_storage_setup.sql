alter table public.profiles
    add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_insert" on storage.objects;
drop policy if exists "avatars_own_update" on storage.objects;
drop policy if exists "avatars_own_delete" on storage.objects;

create policy "avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "avatars_own_insert"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "avatars_own_update"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "avatars_own_delete"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
);

create or replace function public.update_own_profile_avatar(
    p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Not authenticated';
    end if;

    update public.profiles
    set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
        updated_at = now()
    where id = (select auth.uid());

    if not found then
        raise exception 'Profile not found';
    end if;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        (select auth.uid()),
        'Profile Photo Updated',
        'User Account',
        'User updated their profile photo.'
    );
end;
$$;

revoke all on function public.update_own_profile_avatar(text) from public;
grant execute on function public.update_own_profile_avatar(text) to authenticated;;
