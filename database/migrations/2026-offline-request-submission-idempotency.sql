create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.offline_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_type text not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

revoke all on table private.offline_operation_receipts from public, anon, authenticated;

create or replace function private.claim_offline_operation(p_operation_id uuid, p_operation_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row_count integer;
  v_existing_type text;
  v_result_id uuid;
begin
  if v_user_id is null or p_operation_id is null then
    raise exception 'An authenticated user and operation ID are required.' using errcode = '42501';
  end if;

  insert into private.offline_operation_receipts (user_id, operation_id, operation_type)
  values (v_user_id, p_operation_id, p_operation_type)
  on conflict (user_id, operation_id) do nothing;

  get diagnostics v_row_count = row_count;
  if v_row_count = 1 then
    return null;
  end if;

  select receipt.operation_type, receipt.result_id
    into v_existing_type, v_result_id
    from private.offline_operation_receipts receipt
   where receipt.user_id = v_user_id
     and receipt.operation_id = p_operation_id;

  if v_existing_type <> p_operation_type or v_result_id is null then
    raise exception 'Operation ID has already been used or has no completed result.' using errcode = '23505';
  end if;

  return v_result_id;
end;
$$;

revoke all on function private.claim_offline_operation(uuid, text) from public, anon, authenticated;

create or replace function public.submit_bhw_medicine_request_idempotent(p_operation_id uuid, p_items jsonb, p_remarks text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request_id uuid;
begin
  v_request_id := private.claim_offline_operation(p_operation_id, 'BHW_MEDICINE_REQUEST');
  if v_request_id is not null then return v_request_id; end if;
  v_request_id := public.submit_bhw_medicine_request(p_items, p_remarks);
  update private.offline_operation_receipts set result_id = v_request_id where user_id = auth.uid() and operation_id = p_operation_id;
  return v_request_id;
end;
$$;

create or replace function public.create_manual_medicine_request_idempotent(p_operation_id uuid, p_facility_id uuid, p_items jsonb, p_manual_requested_by text default null, p_remarks text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request_id uuid;
begin
  v_request_id := private.claim_offline_operation(p_operation_id, 'MANUAL_MEDICINE_REQUEST');
  if v_request_id is not null then return v_request_id; end if;
  v_request_id := public.create_manual_medicine_request(p_facility_id, p_items, p_manual_requested_by, p_remarks);
  update private.offline_operation_receipts set result_id = v_request_id where user_id = auth.uid() and operation_id = p_operation_id;
  return v_request_id;
end;
$$;

create or replace function public.submit_bhw_stock_transfer_request_idempotent(p_operation_id uuid, p_source_facility_id uuid, p_items jsonb, p_remarks text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_transfer_id uuid;
begin
  v_transfer_id := private.claim_offline_operation(p_operation_id, 'BHW_STOCK_TRANSFER_REQUEST');
  if v_transfer_id is not null then return v_transfer_id; end if;
  v_transfer_id := public.submit_bhw_stock_transfer_request(p_source_facility_id, p_items, p_remarks);
  update private.offline_operation_receipts set result_id = v_transfer_id where user_id = auth.uid() and operation_id = p_operation_id;
  return v_transfer_id;
end;
$$;

create or replace function public.create_cho_stock_transfer_idempotent(p_operation_id uuid, p_source_facility_id uuid, p_destination_facility_id uuid, p_items jsonb, p_remarks text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_transfer_id uuid;
begin
  v_transfer_id := private.claim_offline_operation(p_operation_id, 'CHO_STOCK_TRANSFER');
  if v_transfer_id is not null then return v_transfer_id; end if;
  v_transfer_id := public.create_cho_stock_transfer(p_source_facility_id, p_destination_facility_id, p_items, p_remarks);
  update private.offline_operation_receipts set result_id = v_transfer_id where user_id = auth.uid() and operation_id = p_operation_id;
  return v_transfer_id;
end;
$$;

revoke all on function public.submit_bhw_medicine_request_idempotent(uuid, jsonb, text) from public, anon;
revoke all on function public.create_manual_medicine_request_idempotent(uuid, uuid, jsonb, text, text) from public, anon;
revoke all on function public.submit_bhw_stock_transfer_request_idempotent(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.create_cho_stock_transfer_idempotent(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.submit_bhw_medicine_request_idempotent(uuid, jsonb, text) to authenticated;
grant execute on function public.create_manual_medicine_request_idempotent(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function public.submit_bhw_stock_transfer_request_idempotent(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.create_cho_stock_transfer_idempotent(uuid, uuid, uuid, jsonb, text) to authenticated;
