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
  full_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '');
  first_name_value := coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Google');
  last_name_value := coalesce(nullif(trim(substr(full_name, length(first_name_value) + 1)), ''), 'User');

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    firebase_uid,
    role,
    status
  )
  values (
    new.id,
    first_name_value,
    last_name_value,
    new.email,
    null,
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

insert into public.profiles (
  id,
  first_name,
  last_name,
  email,
  firebase_uid,
  role,
  status
)
select
  u.id,
  coalesce(nullif(split_part(nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''), ' ', 1), ''), 'Google') as first_name,
  coalesce(
    nullif(
      trim(
        substr(
          nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
          length(coalesce(nullif(split_part(nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''), ' ', 1), ''), 'Google')) + 1
        )
      ),
      ''
    ),
    'User'
  ) as last_name,
  u.email,
  null,
  'BHW',
  'PENDING'
from auth.users u
where u.email is not null
  and not exists (
    select 1
    from public.profiles p
    where p.id = u.id
       or p.email = u.email
  );;
