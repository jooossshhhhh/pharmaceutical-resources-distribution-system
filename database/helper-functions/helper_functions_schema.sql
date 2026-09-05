/*
=====================================================
HELPER FUNCTIONS
Purpose:
Reusable functions for RLS policies.
=====================================================
*/

-- ==========================================
-- Resolve current PRDS profile
-- Uses the current Supabase Auth user id.
-- ==========================================

create or replace function get_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select auth.uid();
$$;


-- ==========================================
-- Check if current user is Pharma II
-- ==========================================

create or replace function is_pharma_ii()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from profiles p
        join facilities f
          on f.id = p.facility_id
        where p.id = get_current_profile_id()
        and p.role = 'PHARMA_II'
        and p.status = 'ACTIVE'
        and f.status = 'ACTIVE'
        and f.facility_type = 'CHO'
    );
$$;


-- ==========================================
-- Check if current user is Pharma I
-- ==========================================

create or replace function is_pharma_i()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from profiles
        where id = get_current_profile_id()
        and role = 'PHARMA_I'
        and status = 'ACTIVE'
    );
$$;


-- ==========================================
-- Check if current user is BHW
-- ==========================================

create or replace function is_bhw()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from profiles
        where id = get_current_profile_id()
        and role = 'BHW'
        and status = 'ACTIVE'
    );
$$;


-- ==========================================
-- Get current user's facility
-- ==========================================

create or replace function get_user_facility()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select facility_id
    from profiles
    where id = get_current_profile_id()
      and status = 'ACTIVE';
$$;


-- ==========================================
-- Check if facility matches current user
-- ==========================================

create or replace function is_same_facility(
    target_facility uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select target_facility = get_user_facility();
$$;

revoke all on function get_current_profile_id() from public, anon;
revoke all on function is_pharma_ii() from public, anon;
revoke all on function is_pharma_i() from public, anon;
revoke all on function is_bhw() from public, anon;
revoke all on function get_user_facility() from public, anon;
revoke all on function is_same_facility(uuid) from public, anon;

grant execute on function get_current_profile_id() to authenticated;
grant execute on function is_pharma_ii() to authenticated;
grant execute on function is_pharma_i() to authenticated;
grant execute on function is_bhw() to authenticated;
grant execute on function get_user_facility() to authenticated;
grant execute on function is_same_facility(uuid) to authenticated;


-- ==========================================
-- Safely update current user's editable profile fields
-- Role, status, and facility are intentionally excluded.
-- ==========================================

create or replace function update_own_profile_contact(
    p_first_name text,
    p_last_name text,
    p_email text default null,
    p_phone_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_profile public.profiles%rowtype;
    v_auth_email text;
    v_auth_phone text;
    v_auth_phone_digits text;
    v_auth_phone_local text;
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

    select email, phone
    into v_auth_email, v_auth_phone
    from auth.users
    where id = auth.uid();

    v_auth_phone_digits := regexp_replace(coalesce(v_auth_phone, ''), '[^0-9]', '', 'g');
    v_auth_phone_local := case
        when v_auth_phone_digits ~ '^63[0-9]{10}$' then '0' || substring(v_auth_phone_digits from 3)
        when v_auth_phone_digits ~ '^09[0-9]{9}$' then v_auth_phone_digits
        else null
    end;

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

    if coalesce(v_profile.phone_number, '') is distinct from coalesce(v_next_phone_local, '') then
        if v_next_phone_local is null then
            if v_auth_phone_local is not null then
                raise exception 'Remove phone login through Supabase Auth before clearing the profile phone number';
            end if;
        elsif v_next_phone_local is distinct from v_auth_phone_local then
            raise exception 'Phone updates require verified Supabase Auth phone login';
        end if;

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

revoke all on function update_own_profile_contact(text, text, text, text) from public, anon;
grant execute on function update_own_profile_contact(text, text, text, text) to authenticated;


-- ==========================================
-- Log a password change initiated by the current user.
-- Password contents are never stored.
-- ==========================================

create or replace function log_own_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    insert into activity_logs (user_id, action, module, details)
    values (auth.uid(), 'Password Changed', 'User Account', 'User changed their account password.');
end;
$$;

revoke all on function log_own_password_change() from public;
grant execute on function log_own_password_change() to authenticated;


-- ==========================================
-- Notify admins and log when a user requests facility change.
-- ==========================================

create or replace function notify_and_log_facility_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_name text;
    v_current_facility text;
    v_requested_facility text;
    v_admin_id uuid;
begin
    select concat_ws(' ', p.first_name, p.last_name)
    into v_user_name
    from profiles p
    where p.id = new.profile_id;

    select facility_name into v_current_facility
    from facilities
    where id = new.current_facility_id;

    select facility_name into v_requested_facility
    from facilities
    where id = new.requested_facility_id;

    insert into activity_logs (user_id, action, module, details)
    values (
        new.profile_id,
        'Facility Change Requested',
        'User Account',
        coalesce(v_user_name, 'User') || ' requested facility change from ' || coalesce(v_current_facility, 'No facility') || ' to ' || coalesce(v_requested_facility, 'No facility') || coalesce('. Reason: ' || nullif(new.reason, ''), '.')
    );

    for v_admin_id in
        select id from profiles where role = 'PHARMA_II' and status = 'ACTIVE'
    loop
        insert into notifications (user_id, title, message)
        values (
            v_admin_id,
            'Facility Change Request',
            coalesce(v_user_name, 'A user') || ' requested transfer to ' || coalesce(v_requested_facility, 'another facility') || '.'
        );
    end loop;

    return new;
end;
$$;

drop trigger if exists on_profile_facility_change_requested on public.profile_facility_change_requests;
create trigger on_profile_facility_change_requested
after insert on public.profile_facility_change_requests
for each row execute function notify_and_log_facility_change_request();

revoke all on function notify_and_log_facility_change_request() from public, anon, authenticated;


-- ==========================================
-- Review a pending facility-change request.
-- Approval updates the user's assigned facility.
-- ==========================================

create or replace function review_profile_facility_change_request(
    p_request_id uuid,
    p_status facility_change_request_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request profile_facility_change_requests%rowtype;
    v_requested_facility text;
    v_reviewer_name text;
begin
    if not is_pharma_ii() then
        raise exception 'Only Pharmacist II can review facility change requests';
    end if;

    if p_status not in ('APPROVED', 'REJECTED') then
        raise exception 'Facility change review status must be APPROVED or REJECTED';
    end if;

    select *
    into v_request
    from profile_facility_change_requests
    where id = p_request_id
      and status = 'PENDING'
    for update;

    if not found then
        raise exception 'Pending facility change request not found';
    end if;

    select facility_name into v_requested_facility
    from facilities
    where id = v_request.requested_facility_id;

    select concat_ws(' ', first_name, last_name) into v_reviewer_name
    from profiles
    where id = auth.uid();

    update profile_facility_change_requests
    set
        status = p_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = v_request.id;

    if p_status = 'APPROVED' then
        update profiles
        set facility_id = v_request.requested_facility_id,
            updated_at = now()
        where id = v_request.profile_id;
    end if;

    insert into activity_logs (user_id, action, module, details)
    values (
        v_request.profile_id,
        case when p_status = 'APPROVED' then 'Facility Change Approved' else 'Facility Change Rejected' end,
        'User Account',
        'Facility change to ' || coalesce(v_requested_facility, 'requested facility') || ' was ' || lower(p_status::text) || ' by ' || coalesce(v_reviewer_name, 'an administrator') || '.'
    );

    insert into notifications (user_id, title, message)
    values (
        v_request.profile_id,
        case when p_status = 'APPROVED' then 'Facility Change Approved' else 'Facility Change Rejected' end,
        case
            when p_status = 'APPROVED' then 'Your facility change request to ' || coalesce(v_requested_facility, 'the requested facility') || ' has been approved.'
            else 'Your facility change request to ' || coalesce(v_requested_facility, 'the requested facility') || ' has been rejected.'
        end
    );
end;
$$;

revoke all on function review_profile_facility_change_request(uuid, facility_change_request_status) from public;
grant execute on function review_profile_facility_change_request(uuid, facility_change_request_status) to authenticated;


-- ==========================================
-- Prevent accidental lockout of all active
-- CHO-assigned Pharmacist II accounts.
-- ==========================================

create or replace function prevent_last_active_pharma_ii_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_was_active_cho_pharma_ii boolean := false;
    v_will_remain_active_cho_pharma_ii boolean := false;
    v_other_active_cho_pharma_ii_count integer := 0;
begin
    if tg_op = 'UPDATE' then
        select exists (
            select 1
            from facilities f
            where f.id = old.facility_id
              and old.role = 'PHARMA_II'
              and old.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_was_active_cho_pharma_ii;

        if not v_was_active_cho_pharma_ii then
            return new;
        end if;

        select exists (
            select 1
            from facilities f
            where f.id = new.facility_id
              and new.role = 'PHARMA_II'
              and new.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_will_remain_active_cho_pharma_ii;

        if v_will_remain_active_cho_pharma_ii then
            return new;
        end if;
    elsif tg_op = 'DELETE' then
        select exists (
            select 1
            from facilities f
            where f.id = old.facility_id
              and old.role = 'PHARMA_II'
              and old.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_was_active_cho_pharma_ii;

        if not v_was_active_cho_pharma_ii then
            return old;
        end if;
    end if;

    select count(*)::integer
    into v_other_active_cho_pharma_ii_count
    from profiles p
    join facilities f
      on f.id = p.facility_id
    where p.id <> old.id
      and p.role = 'PHARMA_II'
      and p.status = 'ACTIVE'
      and f.status = 'ACTIVE'
      and f.facility_type = 'CHO';

    if v_other_active_cho_pharma_ii_count = 0 then
        raise exception 'At least one active Pharmacist II assigned to CHO must remain.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

revoke all on function prevent_last_active_pharma_ii_lockout() from public, anon, authenticated;

drop trigger if exists prevent_last_active_pharma_ii_lockout_on_update
on public.profiles;

create trigger prevent_last_active_pharma_ii_lockout_on_update
before update of role, status, facility_id
on public.profiles
for each row
execute function prevent_last_active_pharma_ii_lockout();

drop trigger if exists prevent_last_active_pharma_ii_lockout_on_delete
on public.profiles;

create trigger prevent_last_active_pharma_ii_lockout_on_delete
before delete
on public.profiles
for each row
execute function prevent_last_active_pharma_ii_lockout();
