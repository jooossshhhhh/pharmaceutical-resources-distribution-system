/*
=====================================================
Fix Google Profile Completion Policy

Google OAuth creates a partial pending profile through
the auth trigger. Completing registration updates that
own pending row, so allow only that narrow update.
=====================================================
*/

drop policy if exists "users_can_complete_pending_profile" on public.profiles;

create policy "users_can_complete_pending_profile"
on public.profiles
for update
to authenticated
using (
    id = (select auth.uid())
    and status = 'PENDING'
    and email is not null
    and phone_number is null
    and approved_by is null
    and approved_at is null
)
with check (
    id = (select auth.uid())
    and status = 'PENDING'
    and lower(email) = lower((select auth.jwt() ->> 'email'))
    and phone_number is null
    and role in ('BHW', 'PHARMA_I')
    and approved_by is null
    and approved_at is null
    and exists (
        select 1
        from public.facilities f
        where f.id = facility_id
          and f.status = 'ACTIVE'
    )
);
