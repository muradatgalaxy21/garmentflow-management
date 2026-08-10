-- ============================================================
-- WORKER INVENTORY CONSUMPTION + ACCESSORY RESTOCK
-- Migration: 20260810020000_worker_inventory_movements.sql
--
-- Workers logging accessory usage (AccessoriesForm) or fabric usage
-- (CuttingForm) now record a real 'out' inventory_movements row so
-- stock actually decrements (previously it was only recorded in the
-- entry's payload, quantity_on_hand was never touched). Deleting that
-- work entry (admin-only, see 20260810010000) restocks it via an
-- 'in' movement. Also lets accessories-department workers restock
-- accessory stock directly — fabric restocking stays admin/staff-only.
-- ============================================================

-- Workers could already browse accessory/sticker inventory to log usage;
-- cutting workers need to see fabric stock too (CuttingForm's availability
-- check queries inventory_items for the batch's linked fabric).
DROP POLICY "Workers view accessory sticker inventory" ON public.inventory_items;
CREATE POLICY "Workers view accessory sticker fabric inventory" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    AND category IN ('accessory', 'sticker', 'fabric')
  );

-- Workers can log stock movements they perform themselves: accessory/fabric
-- consumption when submitting a department entry, or an accessory restock.
-- Self-attribution (performed_by = auth.uid()) is the security boundary,
-- same pattern as "Workers insert own department entries".
CREATE POLICY "Workers record own movements" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND performed_by = auth.uid()
  );

-- Accessories-department workers can add brand-new accessory variants to
-- inventory when restocking (fabric stays admin/staff-managed only).
CREATE POLICY "Accessories worker create accessory items" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND category = 'accessory'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = 'accessories'
    )
  );
