ALTER POLICY bhw_insert_facility_return_items ON stock_return_items
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stock_returns sr
    JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE sr.id = stock_return_items.return_id
      AND sr.facility_id = p.facility_id
  )
);

ALTER POLICY bhw_view_facility_return_items ON stock_return_items
USING (
  EXISTS (
    SELECT 1 FROM stock_returns sr
    JOIN profiles p ON p.id = (SELECT auth.uid())
    WHERE sr.id = stock_return_items.return_id
      AND (
        sr.facility_id = p.facility_id
        OR p.role IN ('PHARMA_I', 'PHARMA_II')
      )
  )
);;
