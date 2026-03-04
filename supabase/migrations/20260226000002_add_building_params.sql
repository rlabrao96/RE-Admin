-- Add missing penalty and due date parameters to buildings
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS late_payment_fine_utm DECIMAL(5, 2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS due_day INTEGER DEFAULT 10;

-- Ensure interest_rate_percent and grace_period_days exist (from previous migration)
-- This is just for safety in case they weren't applied correctly
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='buildings' AND column_name='interest_rate_percent') THEN
    ALTER TABLE public.buildings ADD COLUMN interest_rate_percent DECIMAL(5, 2) DEFAULT 0.0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='buildings' AND column_name='grace_period_days') THEN
    ALTER TABLE public.buildings ADD COLUMN grace_period_days INTEGER DEFAULT 10;
  END IF;
END $$;
