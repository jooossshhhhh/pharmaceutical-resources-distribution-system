alter table public.medicines enable row level security;

drop policy if exists "pharma_staff_view_medicines" on public.medicines;
drop policy if exists "pharma_staff_insert_medicines" on public.medicines;
drop policy if exists "pharma_staff_update_medicines" on public.medicines;
drop policy if exists "pharma_ii_delete_medicines" on public.medicines;

create policy "pharma_staff_view_medicines"
on public.medicines
for select
to authenticated
using (
  is_pharma_i()
  or
  is_pharma_ii()
  or
  is_bhw()
);

create policy "pharma_staff_insert_medicines"
on public.medicines
for insert
to authenticated
with check (
  is_pharma_i()
  or
  is_pharma_ii()
);

create policy "pharma_staff_update_medicines"
on public.medicines
for update
to authenticated
using (
  is_pharma_i()
  or
  is_pharma_ii()
)
with check (
  is_pharma_i()
  or
  is_pharma_ii()
);

create policy "pharma_ii_delete_medicines"
on public.medicines
for delete
to authenticated
using (
  is_pharma_ii()
);;
