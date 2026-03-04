-- ============================================================
-- Fintoc Integration: movements table + expenses reconciliation columns
-- ============================================================

-- 1. Fintoc movements (raw bank transaction log for audit & matching)
CREATE TABLE IF NOT EXISTS public.fintoc_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE NOT NULL,
    fintoc_id TEXT NOT NULL UNIQUE,          -- Fintoc's own movement ID
    type TEXT NOT NULL CHECK (type IN ('inflow', 'outflow')),
    amount INTEGER NOT NULL,                 -- CLP
    currency TEXT DEFAULT 'CLP',
    description TEXT,
    post_date DATE NOT NULL,
    transaction_date DATE,
    holder_id TEXT,                           -- RUT of the counterpart (sender/receiver)
    holder_name TEXT,
    reference_id TEXT,                        -- bank reference number
    reconciliation_status TEXT DEFAULT 'unmatched'
        CHECK (reconciliation_status IN ('unmatched', 'auto_matched', 'manual_matched', 'ignored')),
    matched_charge_id uuid REFERENCES public.charges(id) ON DELETE SET NULL,
    matched_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
    raw_data JSONB,                          -- full Fintoc response for audit
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fintoc_movements_building ON public.fintoc_movements(building_id);
CREATE INDEX IF NOT EXISTS idx_fintoc_movements_status ON public.fintoc_movements(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_fintoc_movements_holder ON public.fintoc_movements(holder_id);

-- 2. Add reconciliation columns to expenses (if not already present)
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS fintoc_transaction_id TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'matched', 'unmatched'));

-- 3. Add account_owner_name and fintoc_account_id to bank_account_config
ALTER TABLE public.bank_account_config ADD COLUMN IF NOT EXISTS account_owner_name TEXT;
ALTER TABLE public.bank_account_config ADD COLUMN IF NOT EXISTS fintoc_account_id TEXT;
ALTER TABLE public.bank_account_config ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
