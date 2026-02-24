-- Alter existing expenses table to add period and remove strict category checks
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
