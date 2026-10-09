-- =====================================================
-- Migration: Cleanup & Drop Obsolete Stock Transfers
-- Purpose: Safely drops unused stock transfer tables,
--          foreign keys, types, and RPC functions.
-- =====================================================

-- 1. Drop dependent transfer tables in cascading order
DROP TABLE IF EXISTS public.stock_transfer_fulfillments CASCADE;
DROP TABLE IF EXISTS public.stock_transfer_items CASCADE;
DROP TABLE IF EXISTS public.stock_transfers CASCADE;

-- 2. Drop obsolete transfer stored procedures / RPCs
DROP FUNCTION IF EXISTS public.approve_stock_transfer_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_and_release_stock_transfer(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_stock_transfer_allocation_batches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_stock_transfer_release_batches(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_transfer_source_availability(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.allocate_stock_transfer_for_pickup(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_stock_transfer_received(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_stock_transfer_received(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_cho_stock_transfer(uuid, uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_cho_stock_transfer_idempotent(uuid, uuid, uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.reject_stock_transfer_request(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_bhw_stock_transfer_request(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_bhw_stock_transfer_request_idempotent(uuid, uuid, jsonb, text) CASCADE;

-- 3. Drop obsolete enum type
DROP TYPE IF EXISTS public.transfer_status CASCADE;
