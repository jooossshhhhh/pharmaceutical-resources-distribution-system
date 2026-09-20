create policy "registration_can_view_active_facilities"
on public.facilities
for select
to anon, authenticated
using (status = 'ACTIVE');;
