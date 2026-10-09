-- Clean up stock return policies and indexes flagged by Supabase advisors.

drop policy if exists pharma_staff_all_stock_returns on public.stock_returns;
drop policy if exists bhw_view_own_stock_returns on public.stock_returns;
drop policy if exists bhw_insert_own_stock_returns on public.stock_returns;

create policy stock_returns_select_for_roles
on public.stock_returns
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role in ('PHARMA_I', 'PHARMA_II')
        or (p.role = 'BHW' and p.facility_id = stock_returns.facility_id)
      )
  )
);

create policy stock_returns_insert_for_roles
on public.stock_returns
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role in ('PHARMA_I', 'PHARMA_II')
        or (p.role = 'BHW' and p.facility_id = stock_returns.facility_id)
      )
  )
);

create policy stock_returns_update_for_pharma
on public.stock_returns
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('PHARMA_I', 'PHARMA_II')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('PHARMA_I', 'PHARMA_II')
  )
);

create policy stock_returns_delete_for_pharma
on public.stock_returns
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('PHARMA_I', 'PHARMA_II')
  )
);

create index if not exists idx_stock_returns_returned_by_id
on public.stock_returns(returned_by_id);

create index if not exists idx_stock_returns_received_by_id
on public.stock_returns(received_by_id);

create index if not exists idx_stock_returns_submitted_by_id
on public.stock_returns(submitted_by_id);

create index if not exists idx_stock_returns_verified_by_id
on public.stock_returns(verified_by_id);
