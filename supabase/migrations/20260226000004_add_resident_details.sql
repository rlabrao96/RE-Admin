-- Add separate name/contact fields to residents for direct import (without Supabase auth pre-registration)
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS phone TEXT;
