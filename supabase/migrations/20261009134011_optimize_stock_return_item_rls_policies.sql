alter policy bhw_insert_facility_return_items
on public.stock_return_items
with check (
  exists (
    select 1
    from public.stock_returns sr
    join public.profiles p on p.id = (select auth.uid())
    where sr.id = stock_return_items.return_id
      and sr.source_facility_id = p.facility_id
  )
);

alter policy bhw_view_facility_return_items
on public.stock_return_items
using (
  exists (
    select 1
    from public.stock_returns sr
    join public.profiles p on p.id = (select auth.uid())
    where sr.id = stock_return_items.return_id
      and (
        sr.source_facility_id = p.facility_id
        or p.role = any (array['PHARMA_I'::public.user_role, 'PHARMA_II'::public.user_role])
      )
  )
);

alter policy pharma_staff_all_return_items
on public.stock_return_items
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any (array['PHARMA_I'::public.user_role, 'PHARMA_II'::public.user_role])
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = any (array['PHARMA_I'::public.user_role, 'PHARMA_II'::public.user_role])
  )
);
