-- Fintoc checkout sessions — tracks resident payment sessions
CREATE TABLE IF NOT EXISTS public.fintoc_checkout_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fintoc_session_id TEXT NOT NULL UNIQUE,
    building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
    charge_ids TEXT[] NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'clp',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'finished', 'expired', 'failed')),
    payment_intent_id TEXT,
    resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fintoc_checkout_session_id ON public.fintoc_checkout_sessions(fintoc_session_id);
