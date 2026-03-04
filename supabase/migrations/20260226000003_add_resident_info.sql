-- Add full_name and email to residents table to support pre-registration info from imports
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS email TEXT;

-- Move data from invite_email to email if anyone was already using it
UPDATE public.residents SET email = invite_email WHERE email IS NULL AND invite_email IS NOT NULL;
