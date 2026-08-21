-- ============================================================
-- WAGE RATE EXPANSION — payroll wired to real department_entries
-- Migration: 20260821010000_wage_rate_expansion.sql
--
-- Audit (2026-08-21) found payroll (EmployeesPage) only ever summed the
-- legacy batch_tracking table, never department_entries — the real
-- worker QR data for 12 of 13 departments. User confirmed (2026-08-21):
--   - Cutting: cost-tracking only, workers are monthly-salaried.
--   - Printing/Embroidery: cost-tracking only (like cutting), not wage.
--   - Sticker, Quality, Stitching, Button Ops, Clipping, Press,
--     Quality (Final), Packing: workers ARE paid per piece — need a
--     rate tracked and summed into payout.
-- Lot Bundling is cutting workers' second pass (see plan.md §4.2) —
-- treated the same as Cutting (cost-only), not asked about explicitly
-- but structurally identical; flagged in progress.md as an inference.
--
-- department_cost_rates already exists (admin/manager-set, read-only to
-- workers) and already covers printing/embroidery/clipping. Widening the
-- same table rather than adding a new one — it was always a generic
-- {department, label, rate} store.
-- ============================================================

ALTER TABLE public.department_cost_rates DROP CONSTRAINT IF EXISTS department_cost_rates_department_check;
ALTER TABLE public.department_cost_rates ADD CONSTRAINT department_cost_rates_department_check
  CHECK (department IN (
    'printing', 'embroidery', 'clipping',
    'sticker', 'quality', 'stitching', 'button_ops', 'press', 'quality_final', 'packing'
  ));
