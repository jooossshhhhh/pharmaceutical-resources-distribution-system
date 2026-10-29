-- Migration: 2026-remove-phone-auth-requirement-from-profile-update.sql
-- Description: Allow updating contact phone number directly in profiles without requiring verified Supabase Auth phone login

create or replace function public.update_own_profile_contact(
    p_email text,
    p_first_name text,
    p_last_name text,
    p_phone_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles%rowtype;
    v_auth_email text;
    v_next_first_name text := trim(p_first_name);
    v_next_last_name text := trim(p_last_name);
    v_next_email text := nullif(trim(coalesce(p_email, '')), '');
    v_next_phone_number text := nullif(trim(coalesce(p_phone_number, '')), '');
    v_next_phone_digits text;
    v_next_phone_local text;
    v_details text[] := array[]::text[];
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if nullif(v_next_first_name, '') is null then
        raise exception 'First name is required';
    end if;

    if nullif(v_next_last_name, '') is null then
        raise exception 'Last name is required';
    end if;

    select email
    into v_auth_email
    from auth.users
    where id = auth.uid();

    v_next_phone_digits := regexp_replace(coalesce(v_next_phone_number, ''), '[^0-9]', '', 'g');
    v_next_phone_local := case
        when v_next_phone_digits = '' then null
        when v_next_phone_digits ~ '^63[0-9]{10}$' then '0' || substring(v_next_phone_digits from 3)
        when v_next_phone_digits ~ '^09[0-9]{9}$' then v_next_phone_digits
        else null
    end;

    if v_next_phone_number is not null and v_next_phone_local is null then
        raise exception 'Phone number must use 09XXXXXXXXX format';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
    for update;

    if not found then
        raise exception 'An active profile is required to update contact details';
    end if;

    if v_profile.email is distinct from v_next_email then
        if v_next_email is null then
            if v_auth_email is not null then
                raise exception 'Remove Gmail login through Supabase Auth before clearing the profile email';
            end if;
        elsif lower(v_next_email) is distinct from lower(coalesce(v_auth_email, '')) then
            raise exception 'Email updates require a verified Supabase Auth email';
        end if;

        v_details := array_append(
            v_details,
            'Gmail changed from "' || coalesce(v_profile.email, 'Not connected') || '" to "' || coalesce(v_next_email, 'Not connected') || '"'
        );
    end if;

    -- Update phone number as database contact info without requiring Supabase Auth phone identity
    if coalesce(v_profile.phone_number, '') is distinct from coalesce(v_next_phone_local, '') then
        v_details := array_append(
            v_details,
            'Phone number changed from "' || coalesce(v_profile.phone_number, 'Not connected') || '" to "' || coalesce(v_next_phone_local, 'Not connected') || '"'
        );
    end if;

    if v_profile.first_name is distinct from v_next_first_name then
        v_details := array_append(v_details, 'First name changed from "' || coalesce(v_profile.first_name, '') || '" to "' || v_next_first_name || '"');
    end if;

    if v_profile.last_name is distinct from v_next_last_name then
        v_details := array_append(v_details, 'Last name changed from "' || coalesce(v_profile.last_name, '') || '" to "' || v_next_last_name || '"');
    end if;

    update public.profiles
    set
        first_name = v_next_first_name,
        last_name = v_next_last_name,
        email = v_next_email,
        phone_number = v_next_phone_local,
        updated_at = now()
    where id = auth.uid();

    if coalesce(array_length(v_details, 1), 0) > 0 then
        insert into public.activity_logs (user_id, action, module, details)
        values (auth.uid(), 'Profile Updated', 'User Account', array_to_string(v_details, '; '));
    end if;
end;
$$;

revoke all on function public.update_own_profile_contact(text, text, text, text) from public, anon;
grant execute on function public.update_own_profile_contact(text, text, text, text) to authenticated;
