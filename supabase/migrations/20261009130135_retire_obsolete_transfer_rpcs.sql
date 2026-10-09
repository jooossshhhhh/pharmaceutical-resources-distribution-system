-- Drop retired stock-transfer write/action RPCs. The stock-transfer tables were
-- removed because the feature is no longer part of PRDS.
DROP FUNCTION IF EXISTS public.create_cho_stock_transfer(uuid, uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_cho_stock_transfer_idempotent(uuid, uuid, uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.reject_stock_transfer_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_bhw_stock_transfer_request(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_bhw_stock_transfer_request_idempotent(uuid, uuid, jsonb, text) CASCADE;
