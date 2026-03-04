-- Migration: Add/Update documents table
-- Description: Ensures documents table exists with all required columns for both Admin and Resident portals.

-- 1. Create table if fundamentally missing
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now()
);

-- 2. Add missing columns safely
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='building_id') THEN
        ALTER TABLE public.documents ADD COLUMN building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='name') THEN
        ALTER TABLE public.documents ADD COLUMN name text NOT NULL DEFAULT 'Documento';
        ALTER TABLE public.documents ALTER COLUMN name DROP DEFAULT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='file_path') THEN
        ALTER TABLE public.documents ADD COLUMN file_path text NOT NULL DEFAULT '';
        ALTER TABLE public.documents ALTER COLUMN file_path DROP DEFAULT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='content_type') THEN
        ALTER TABLE public.documents ADD COLUMN content_type text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='size') THEN
        ALTER TABLE public.documents ADD COLUMN size BIGINT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='is_visible') THEN
        ALTER TABLE public.documents ADD COLUMN is_visible boolean DEFAULT false;
    END IF;

    -- Fix for existing columns that might have NOT NULL constraints
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='type') THEN
        ALTER TABLE public.documents ALTER COLUMN "type" DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='description') THEN
        ALTER TABLE public.documents ALTER COLUMN "description" DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='url') THEN
        ALTER TABLE public.documents ALTER COLUMN "url" DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='storage_url') THEN
        ALTER TABLE public.documents ALTER COLUMN "storage_url" DROP NOT NULL;
    END IF;
END $$;

-- 3. Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Drop and recreate to ensure correctness)
DROP POLICY IF EXISTS "Residents can see visible documents" ON public.documents;
CREATE POLICY "Residents can see visible documents" ON public.documents
    FOR SELECT USING (is_visible = true);

DROP POLICY IF EXISTS "Admins have full access to documents" ON public.documents;
CREATE POLICY "Admins have full access to documents" ON public.documents
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        EXISTS (
            SELECT 1 FROM public.buildings b
            WHERE b.id = public.documents.building_id
            AND b.admin_id = auth.uid()
        )
    );
