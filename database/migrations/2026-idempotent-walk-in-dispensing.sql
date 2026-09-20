create table if not exists public.dispensing_idempotency_keys (
  operation_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  items jsonb not null,
  prescribed_by text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.dispensing_idempotency_keys enable row level security;

revoke all on table public.dispensing_idempotency_keys from public, anon, authenticated;

create or replace function public.dispense_walk_in_idempotent(
  p_operation_id uuid,
  p_patient_id uuid,
  p_items jsonb,
  p_prescribed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.dispensing_idempotency_keys%rowtype;
  v_result jsonb;
begin
  if p_operation_id is null then
    raise exception 'Operation ID is required.' using errcode = '22023';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );

  select *
  into v_existing
  from public.dispensing_idempotency_keys
  where operation_id = p_operation_id;

  if found then
    if v_existing.user_id is distinct from auth.uid()
      or v_existing.patient_id is distinct from p_patient_id
      or v_existing.items is distinct from p_items
      or v_existing.prescribed_by is distinct from pg_catalog.btrim(p_prescribed_by)
    then
      raise exception 'Operation ID was already used for a different dispensing request.'
        using errcode = '22023';
    end if;

    return v_existing.result;
  end if;

  v_result := public.dispense_walk_in(p_patient_id, p_items, p_prescribed_by);

  insert into public.dispensing_idempotency_keys (
    operation_id,
    user_id,
    patient_id,
    items,
    prescribed_by,
    result
  )
  values (
    p_operation_id,
    auth.uid(),
    p_patient_id,
    p_items,
    pg_catalog.btrim(p_prescribed_by),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.dispense_walk_in_idempotent(uuid, uuid, jsonb, text) from public;
revoke all on function public.dispense_walk_in_idempotent(uuid, uuid, jsonb, text) from anon;
grant execute on function public.dispense_walk_in_idempotent(uuid, uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
