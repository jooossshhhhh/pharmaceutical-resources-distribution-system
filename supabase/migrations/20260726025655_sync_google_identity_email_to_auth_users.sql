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

with latest_google_identity as (
  select distinct on (i.user_id)
    i.user_id,
    i.email
  from auth.identities i
  where i.provider = 'google'
    and i.email is not null
  order by i.user_id, i.created_at desc
)
update auth.users u
set
  email = g.email,
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
from latest_google_identity g
where u.id = g.user_id
  and u.email is null
  and not exists (
    select 1
    from auth.users existing_user
    where existing_user.email = g.email
      and existing_user.id <> g.user_id
  );

with latest_google_identity as (
  select distinct on (i.user_id)
    i.user_id,
    i.email
  from auth.identities i
  where i.provider = 'google'
    and i.email is not null
  order by i.user_id, i.created_at desc
)
update public.profiles p
set
  email = g.email,
  updated_at = now()
from latest_google_identity g
where p.id = g.user_id
  and (p.email is null or p.email = g.email)
  and not exists (
    select 1
    from public.profiles existing_profile
    where existing_profile.email = g.email
      and existing_profile.id <> g.user_id
  );;
