-- Fix missing cascades for resident_id references
-- This ensures that when a building is deleted (cascading to residents), 
-- all associated child records are also cleaned up.

DO $$ 
BEGIN
    -- 1. Payments table
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'payments_resident_id_fkey') THEN
        ALTER TABLE public.payments DROP CONSTRAINT payments_resident_id_fkey;
    END IF;
    ALTER TABLE public.payments 
        ADD CONSTRAINT payments_resident_id_fkey 
        FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;

    -- 2. Bookings table
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'bookings_resident_id_fkey') THEN
        ALTER TABLE public.bookings DROP CONSTRAINT bookings_resident_id_fkey;
    END IF;
    ALTER TABLE public.bookings 
        ADD CONSTRAINT bookings_resident_id_fkey 
        FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;

    -- 3. Maintenance Requests table
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '1') THEN
        -- Initial schema used a generic name or we assume standard naming
        ALTER TABLE public.maintenance_requests DROP CONSTRAINT maintenance_requests_resident_id_fkey;
    END IF;
    
    -- Using a safer approach for drop/add since naming might vary if created automatically
    -- but usually it follows table_column_fkey
    
    BEGIN
        ALTER TABLE public.maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_resident_id_fkey;
        ALTER TABLE public.maintenance_requests 
            ADD CONSTRAINT maintenance_requests_resident_id_fkey 
            FOREIGN KEY (resident_id) REFERENCES public.residents(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not handle maintenance_requests constraint: %', SQLERRM;
    END;
END $$;
