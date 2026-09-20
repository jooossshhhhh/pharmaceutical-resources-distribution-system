alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  alter column id set default gen_random_uuid(),
  alter column role set default 'BHW'::public.user_role;

drop policy if exists "users_can_insert_own_firebase_profile" on public.profiles;
drop policy if exists "users_can_insert_own_supabase_profile" on public.profiles;

create policy "users_can_insert_own_firebase_profile"
on public.profiles
for insert
to authenticated
with check (
  firebase_uid is not null
  and firebase_uid = auth.jwt()->>'sub'
  and status = 'PENDING'
);

create policy "users_can_insert_own_supabase_profile"
on public.profiles
for insert
to authenticated
with check (
  firebase_uid is null
  and auth.jwt()->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and id = (auth.jwt()->>'sub')::uuid
  and status = 'PENDING'
);;
