drop policy if exists "pharma_staff_view_logs" on public.activity_logs;

create policy "role_scoped_view_logs"
on public.activity_logs
for select
to authenticated
using (
  is_pharma_ii()
  or (
    is_pharma_i()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles log_profile
        where log_profile.id = activity_logs.user_id
          and log_profile.role = 'BHW'
      )
    )
  )
  or (
    is_bhw()
    and user_id = (select auth.uid())
  )
);;
