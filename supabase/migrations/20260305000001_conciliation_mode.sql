-- Migration: Conciliation Mode support
-- Adds partial payment tracking to charges and a junction table for waterfall allocations

-- 1. Add paid_amount column to charges (tracks how much has been paid for partial payments)
ALTER TABLE public.charges ADD COLUMN IF NOT EXISTS paid_amount INTEGER DEFAULT 0;

-- 2. Expand status check to include 'partial'
ALTER TABLE public.charges DROP CONSTRAINT IF EXISTS charges_status_check;
ALTER TABLE public.charges ADD CONSTRAINT charges_status_check
  CHECK (status IN ('pending', 'paid', 'partial', 'overdue'));

-- 3. Junction table: maps one bank movement to one or many charge allocations (waterfall)
--    One movement can partially/fully cover multiple charges in priority order.
CREATE TABLE IF NOT EXISTS public.movement_charge_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid REFERENCES public.fintoc_movements(id) ON DELETE CASCADE NOT NULL,
  charge_id   uuid REFERENCES public.charges(id) ON DELETE CASCADE NOT NULL,
  amount_clp  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mca_movement ON public.movement_charge_allocations(movement_id);
CREATE INDEX IF NOT EXISTS idx_mca_charge   ON public.movement_charge_allocations(charge_id);
