-- ==============================================================================
-- Migration: Grant SELECT on stock_returns to anon under RLS
-- Purpose:
--   Allow PostgREST to process unauthenticated or pre-session queries against
--   public.stock_returns without raising PostgreSQL error 42501 (permission denied).
--   All SELECT RLS policies on public.stock_returns remain strictly scoped to
--   authenticated users (PHARMA_I, PHARMA_II, and facility-matching BHW), ensuring
--   that the anon role receives 0 rows and zero operational data is exposed.
-- ==============================================================================

GRANT SELECT ON public.stock_returns TO anon;
