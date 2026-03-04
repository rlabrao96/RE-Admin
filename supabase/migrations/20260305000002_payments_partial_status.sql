-- Allow 'partial' as a payment status for partial waterfall allocations
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'partial'));
