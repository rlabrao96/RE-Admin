-- Migration: Make building_id nullable and update policies for global documents
-- Description: Allows documents to be shared across all buildings and updates RLS.

-- 1. Make building_id nullable
ALTER TABLE public.documents ALTER COLUMN building_id DROP NOT NULL;

-- 2. Update Admin policy to allow access to global documents
-- Documents are considered global if building_id is NULL.
-- An admin can access a document if they own the building OR if it's a global document.
DROP POLICY IF EXISTS "Admins have full access to documents" ON public.documents;
CREATE POLICY "Admins have full access to documents" ON public.documents
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        building_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.buildings b
            WHERE b.id = public.documents.building_id
            AND b.admin_id = auth.uid()
        )
    );

-- 3. Update Resident policy to allow seeing visible global documents
DROP POLICY IF EXISTS "Residents can see visible documents" ON public.documents;
CREATE POLICY "Residents can see visible documents" ON public.documents
    FOR SELECT USING (
        is_visible = true AND (
            building_id IS NULL OR 
            EXISTS (
                SELECT 1 FROM public.residents r
                JOIN public.units u ON r.unit_id = u.id
                JOIN public.floors f ON u.floor_id = f.id
                WHERE f.building_id = public.documents.building_id
                AND r.user_id = auth.uid()
                AND r.status = 'active'
            )
        )
    );
