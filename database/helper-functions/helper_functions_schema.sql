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
        from profiles
        where id = get_current_profile_id()
        and role = 'PHARMA_II'
        and status = 'ACTIVE'
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
    where id = get_current_profile_id();
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

    update profiles
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

revoke all on function update_own_profile_contact(text, text, text, text) from public;
grant execute on function update_own_profile_contact(text, text, text, text) to authenticated;
