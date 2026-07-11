/*
=====================================================
PHASE 15A — RLS POLICIES (Profile and Notification)
=====================================================

Tables:
- profiles
- notifications

Purpose:
Implements user access control for
authentication and notification management.

Business Rules:

Profiles
--------
✓ Users can view their own profile

✓ Pharma II can view all profiles

✓ Pharma II can update profiles
  (approval, activation, deactivation,
   role assignment, facility assignment)

Notifications
-------------
✓ Users can view their own notifications

✓ Users can update their own notifications
  (mark as read)

✓ Pharma II can create notifications

Dependencies:
- auth.users
- profiles
- helper functions

Helper Functions Used:
- is_pharma_ii()

=====================================================
*/


/*
=====================================================
PROFILES RLS
=====================================================
*/


-- Users can view their own profile

create policy "users_can_view_own_profile"

on profiles

for select

to authenticated

using (
    id = get_current_profile_id()
);


-- Users can create their own pending profile

create policy "users_can_insert_own_profile"

on profiles

for insert

to authenticated

with check (
    id = auth.uid()
    and status = 'PENDING'
);


-- Pharma II can view all profiles

create policy "pharma_ii_can_view_all_profiles"

on profiles

for select

to authenticated

using (
    is_pharma_ii()
);


-- Pharma II can update profiles

create policy "pharma_ii_can_update_profiles"

on profiles

for update

to authenticated

using (
    is_pharma_ii()
)

with check (
    is_pharma_ii()
);



/*
=====================================================
NOTIFICATIONS RLS
=====================================================
*/


-- Users can view their own notifications

create policy "users_can_view_own_notifications"

on notifications

for select

to authenticated

using (
    user_id = get_current_profile_id()
);


-- Users can update their own notifications

create policy "users_can_update_own_notifications"

on notifications

for update

to authenticated

using (
    user_id = get_current_profile_id()
)

with check (
    user_id = get_current_profile_id()
);


-- Pharma II can create notifications

create policy "pharma_ii_can_insert_notifications"

on notifications

for insert

to authenticated

with check (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15A
=====================================================

Tables Secured:

✓ profiles
✓ notifications

Implemented Access Control:

Profiles
---------
✓ View own profile
✓ Pharma II view all profiles
✓ Pharma II update profiles

Notifications
-------------
✓ View own  notifications
✓ Update own notifications
✓ Pharma II create notifications

Next Phase:
Phase 15B — Facilities & Inventory RLS

=====================================================
*/
