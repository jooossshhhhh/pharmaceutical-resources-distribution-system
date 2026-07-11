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
