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
