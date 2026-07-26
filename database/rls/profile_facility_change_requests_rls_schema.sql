/*
=====================================================
PROFILE FACILITY CHANGE REQUESTS RLS
=====================================================

Users can create and view their own facility-change requests.
Pharmacist II users can view and review all requests.

=====================================================
*/

alter table profile_facility_change_requests enable row level security;

grant select, insert, update on profile_facility_change_requests to authenticated;

create policy "users_can_view_own_facility_change_requests"
on profile_facility_change_requests
for select
to authenticated
using (
    profile_id = auth.uid()
);

create policy "users_can_insert_own_facility_change_requests"
on profile_facility_change_requests
for insert
to authenticated
with check (
    profile_id = auth.uid()
    and status = 'PENDING'
    and reviewed_by is null
    and reviewed_at is null
);

create policy "pharma_ii_can_view_facility_change_requests"
on profile_facility_change_requests
for select
to authenticated
using (
    is_pharma_ii()
);

create policy "pharma_ii_can_update_facility_change_requests"
on profile_facility_change_requests
for update
to authenticated
using (
    is_pharma_ii()
)
with check (
    is_pharma_ii()
);
