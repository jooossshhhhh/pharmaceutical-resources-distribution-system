/*
=====================================================
AUTH USER PROFILE TRIGGER
Purpose:
Create a pending PRDS profile when a Supabase Auth user is created.
Used by Google sign-in.
=====================================================
*/

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text;
  first_name_value text;
  last_name_value text;
begin
  if new.email is null then
    return new;
  end if;

  full_name := nullif(
    trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')),
    ''
  );

  first_name_value := coalesce(
    nullif(split_part(full_name, ' ', 1), ''),
    'Google'
  );

  last_name_value := coalesce(
    nullif(trim(substr(full_name, length(first_name_value) + 1)), ''),
    'User'
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    role,
    status
  )
  values (
    new.id,
    first_name_value,
    last_name_value,
    new.email,
    'BHW',
    'PENDING'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();


-- ==========================================
-- Sync Google identity email into Auth Users
-- ==========================================

create or replace function public.sync_google_identity_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  remaining_google_email text;
begin
  if tg_op = 'DELETE' then
    if old.provider = 'google' and old.email is not null then
      select i.email
      into remaining_google_email
      from auth.identities i
      where i.user_id = old.user_id
        and i.provider = 'google'
        and i.email is not null
      order by i.created_at desc
      limit 1;

      update auth.users
      set
        email = remaining_google_email,
        email_confirmed_at = case
          when remaining_google_email is null then null
          else coalesce(email_confirmed_at, now())
        end,
        updated_at = now()
      where id = old.user_id
        and (email = old.email or email is null);

      update public.profiles
      set
        email = remaining_google_email,
        updated_at = now()
      where id = old.user_id
        and (email = old.email or email is null);
    end if;

    return old;
  end if;

  if new.provider = 'google' and new.email is not null then
    if not exists (
      select 1
      from auth.users existing_user
      where existing_user.email = new.email
        and existing_user.id <> new.user_id
    ) then
      update auth.users
      set
        email = new.email,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
      where id = new.user_id
        and (email is null or email = new.email);
    end if;

    if not exists (
      select 1
      from public.profiles existing_profile
      where existing_profile.email = new.email
        and existing_profile.id <> new.user_id
    ) then
      update public.profiles
      set
        email = new.email,
        updated_at = now()
      where id = new.user_id
        and (email is null or email = new.email);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_google_identity_email_synced on auth.identities;
drop trigger if exists on_google_identity_email_removed on auth.identities;

create trigger on_google_identity_email_synced
after insert or update of provider, email on auth.identities
for each row execute function public.sync_google_identity_email();

create trigger on_google_identity_email_removed
after delete on auth.identities
for each row execute function public.sync_google_identity_email();
