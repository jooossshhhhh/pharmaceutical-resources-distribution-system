/*
=====================================================
MIGRATION: Profile Avatars

Purpose:
Adds a profile photo to the account header.

Changes:
- Adds avatar_url text column to profiles
- Creates a public "avatars" storage bucket
- Adds storage RLS policies scoped to each user's own folder
- Adds update_own_profile_avatar() helper used by the
  Profile Settings module

Notes:
- avatar_url is optional; null falls back to initials
- Files are stored under avatars/<user-id>/...
- Run after the web changes are deployed.
=====================================================
*/

alter table profiles
    add column if not exists avatar_url text;


-- ==========================================
-- Storage bucket
-- ==========================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;


-- ==========================================
-- Storage policies
-- Users can read any avatar and manage only
-- files inside their own folder.
-- ==========================================

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_own_insert" on storage.objects;
drop policy if exists "avatars_own_update" on storage.objects;
drop policy if exists "avatars_own_delete" on storage.objects;

create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "avatars_own_insert"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "avatars_own_update"
on storage.objects for update
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
on storage.objects for delete
to authenticated
using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
);


-- ==========================================
-- Safely update the current user's avatar.
-- ==========================================

create or replace function update_own_profile_avatar(
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

revoke all on function update_own_profile_avatar(text) from public;
grant execute on function update_own_profile_avatar(text) to authenticated;
