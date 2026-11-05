drop function if exists public.create_cho_stock_transfer(uuid, uuid, jsonb, text) cascade;
drop function if exists public.create_cho_stock_transfer_idempotent(uuid, uuid, uuid, jsonb, text) cascade;
drop function if exists public.reject_stock_transfer_request(uuid, text) cascade;
drop function if exists public.submit_bhw_stock_transfer_request(uuid, jsonb, text) cascade;
drop function if exists public.submit_bhw_stock_transfer_request_idempotent(uuid, uuid, jsonb, text) cascade;;
