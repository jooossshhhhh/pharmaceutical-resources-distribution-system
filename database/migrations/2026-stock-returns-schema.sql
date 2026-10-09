-- =====================================================
-- Migration: Stock Returns Concept & Schema
-- Purpose: Introduces dedicated tables for Barangay Stock Returns
--          segregating them cleanly from Supplier Procurement.
-- =====================================================

-- 1. Create stock_returns header table
CREATE TABLE IF NOT EXISTS public.stock_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_slip_no text NOT NULL UNIQUE,
    source_facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    destination_facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    returned_by_name text,
    returned_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    received_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    return_date date NOT NULL DEFAULT current_date,
    return_reason text NOT NULL DEFAULT 'PROGRAM_ENDED',
    status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VERIFIED', 'CANCELLED')),
    remarks text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create stock_return_items line-item table
CREATE TABLE IF NOT EXISTS public.stock_return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id uuid NOT NULL REFERENCES public.stock_returns(id) ON DELETE CASCADE,
    medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE RESTRICT,
    batch_number text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    expiration_date date NOT NULL,
    unit_cost numeric(10,2),
    target_inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_stock_returns_source_facility ON public.stock_returns(source_facility_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_destination_facility ON public.stock_returns(destination_facility_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_date ON public.stock_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_stock_returns_status ON public.stock_returns(status);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_return ON public.stock_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_medicine ON public.stock_return_items(medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_batch ON public.stock_return_items(batch_number);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.stock_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_return_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for stock_returns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pharma_staff_all_stock_returns' AND tablename = 'stock_returns') THEN
        CREATE POLICY "pharma_staff_all_stock_returns"
        ON public.stock_returns
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role IN ('PHARMA_I', 'PHARMA_II')
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role IN ('PHARMA_I', 'PHARMA_II')
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bhw_view_facility_stock_returns' AND tablename = 'stock_returns') THEN
        CREATE POLICY "bhw_view_facility_stock_returns"
        ON public.stock_returns
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.facility_id = stock_returns.source_facility_id
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bhw_insert_facility_stock_returns' AND tablename = 'stock_returns') THEN
        CREATE POLICY "bhw_insert_facility_stock_returns"
        ON public.stock_returns
        FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.facility_id = stock_returns.source_facility_id
            )
        );
    END IF;
END $$;

-- 6. RLS Policies for stock_return_items
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pharma_staff_all_return_items' AND tablename = 'stock_return_items') THEN
        CREATE POLICY "pharma_staff_all_return_items"
        ON public.stock_return_items
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role IN ('PHARMA_I', 'PHARMA_II')
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.role IN ('PHARMA_I', 'PHARMA_II')
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bhw_view_facility_return_items' AND tablename = 'stock_return_items') THEN
        CREATE POLICY "bhw_view_facility_return_items"
        ON public.stock_return_items
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.stock_returns sr
                JOIN public.profiles p ON p.id = auth.uid()
                WHERE sr.id = stock_return_items.return_id
                AND (sr.source_facility_id = p.facility_id OR p.role IN ('PHARMA_I', 'PHARMA_II'))
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bhw_insert_facility_return_items' AND tablename = 'stock_return_items') THEN
        CREATE POLICY "bhw_insert_facility_return_items"
        ON public.stock_return_items
        FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.stock_returns sr
                JOIN public.profiles p ON p.id = auth.uid()
                WHERE sr.id = stock_return_items.return_id
                AND sr.source_facility_id = p.facility_id
            )
        );
    END IF;
END $$;
