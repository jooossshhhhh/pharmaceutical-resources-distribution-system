-- =========================================================================
-- Migration: Financial Precision, FEFO Index & Immutable Transaction Audit
-- =========================================================================
-- Description:
--   1. Upgrades unit_cost precision to numeric(12, 4) in inventory and stock_returns
--      to prevent fractional rounding loss in bulk institutional procurement.
--   2. Adds partial compound index idx_inventory_fefo_active on active inventory
--      to optimize FEFO (First-Expired, First-Out) stock allocation.
--   3. Enforces the Immutable Record Rule across transaction tables
--      (medicine_dispensing, stock_returns, inventory) via defensive database
--      triggers preventing physical row deletion.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. UPGRADE UNIT COST PRECISION TO numeric(12, 4)
-- -------------------------------------------------------------------------

ALTER TABLE public.inventory 
  ALTER COLUMN unit_cost TYPE numeric(12, 4);

ALTER TABLE public.stock_returns 
  ALTER COLUMN unit_cost TYPE numeric(12, 4);

-- -------------------------------------------------------------------------
-- 2. PARTIAL COMPOUND FEFO INDEX FOR ACTIVE INVENTORY ALLOCATION
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inventory_fefo_active 
  ON public.inventory (facility_id, medicine_id, expiration_date ASC, date_received ASC)
  WHERE quantity > 0;

-- -------------------------------------------------------------------------
-- 3. ENFORCE IMMUTABLE TRANSACTION AUDIT RULE (NO PHYSICAL DELETIONS)
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_transaction_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Physical deletion of % records is prohibited by audit policy. Use voiding, disposal status, or cancellation instead.', TG_TABLE_NAME
    USING errcode = '23504';
END;
$$;

CREATE OR REPLACE TRIGGER trg_prevent_delete_dispensing
  BEFORE DELETE ON public.medicine_dispensing
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transaction_deletion();

CREATE OR REPLACE TRIGGER trg_prevent_delete_inventory
  BEFORE DELETE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transaction_deletion();

CREATE OR REPLACE TRIGGER trg_prevent_delete_stock_returns
  BEFORE DELETE ON public.stock_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transaction_deletion();
