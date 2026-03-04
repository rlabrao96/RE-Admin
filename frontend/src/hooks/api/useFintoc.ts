import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getToken() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No session");
    return session.access_token;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BankAccountConfig {
    id: string;
    building_id: string;
    bank_name?: string;
    account_number?: string;
    account_owner_rut?: string;
    account_owner_name?: string;
    fintoc_link_token?: string;
    fintoc_account_id?: string;
    last_sync_at?: string;
    updated_at?: string;
}

export interface FintocMovement {
    id: string;
    building_id: string;
    fintoc_id: string;
    type: "inflow" | "outflow";
    amount: number;
    currency: string;
    description?: string;
    post_date: string;
    transaction_date?: string;
    holder_id?: string;
    holder_name?: string;
    reference_id?: string;
    reconciliation_status: "unmatched" | "auto_matched" | "manual_matched" | "ignored";
    matched_charge_id?: string;
    matched_expense_id?: string;
    created_at?: string;
}

export interface SyncResult {
    synced_count: number;
    auto_matched_count: number;
    message: string;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useBankConfig(buildingId: string | null) {
    return useQuery<BankAccountConfig | null>({
        queryKey: ["bank-config", buildingId],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/config/${buildingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch bank config");
            return res.json();
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 10,
    });
}

export interface FintocAccount {
    id: string;
    name: string;
    official_name?: string;
    number?: string;
    holder_id?: string;
    holder_name?: string;
    type?: string;
    currency?: string;
    balance?: { available: number; current: number };
}

export function useLinkAccounts(buildingId: string | null, enabled: boolean = false) {
    return useQuery<FintocAccount[]>({
        queryKey: ["fintoc-accounts", buildingId],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/accounts/${buildingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch accounts");
            return res.json();
        },
        enabled: !!buildingId && enabled,
        staleTime: 1000 * 60 * 5,
    });
}

export function useFintocMovements(buildingId: string | null, statusFilter?: string, month?: string) {
    return useQuery<FintocMovement[]>({
        queryKey: ["fintoc-movements", buildingId, statusFilter, month],
        queryFn: async () => {
            const token = await getToken();
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            if (month) params.set("month", month);
            const res = await fetch(
                `${API_URL}/api/fintoc/movements/${buildingId}?${params}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) throw new Error("Failed to fetch movements");
            return res.json();
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useSyncMovements(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation<SyncResult>({
        mutationFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/sync/${buildingId}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Sync failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
            queryClient.invalidateQueries({ queryKey: ["bank-config", buildingId] });
        },
    });
}

export function useManualMatch(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: { movement_id: string; charge_id?: string; expense_id?: string }) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/match`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Match failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
        },
    });
}

export function useIgnoreMovement(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (movementId: string) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/ignore`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ movement_id: movementId }),
            });
            if (!res.ok) throw new Error("Ignore failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
        },
    });
}

export function useUnmatchMovement(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (movementId: string) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/unmatch/${movementId}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Unmatch failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
        },
    });
}

export function useSaveBankConfig(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<BankAccountConfig>) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/config/${buildingId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...payload, building_id: buildingId }),
            });
            if (!res.ok) throw new Error("Save config failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bank-config", buildingId] });
        },
    });
}

// ── Checkout Session (Resident Payment) ──────────────────────────────────────

export interface CheckoutResult {
    redirect_url: string;
    session_id: string;
}

export function useCreateCheckout() {
    return useMutation<CheckoutResult, Error, {
        charge_ids: string[];
        amount: number;
        building_id: string;
        success_url: string;
        cancel_url: string;
    }>({
        mutationFn: async (payload) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/checkout`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error("Checkout creation failed");
            return res.json();
        },
    });
}

// ── Link Intent + Exchange (Admin Account Linking) ───────────────────────────

export interface LinkIntentResult {
    widget_token: string;
}

export function useCreateLinkIntent(buildingId: string | null) {
    return useMutation<LinkIntentResult>({
        mutationFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/link-intent/${buildingId}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Link intent creation failed");
            return res.json();
        },
    });
}

export function useExchangeToken(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation<BankAccountConfig, Error, string>({
        mutationFn: async (exchangeToken: string) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/exchange/${buildingId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ exchange_token: exchangeToken }),
            });
            if (!res.ok) throw new Error("Token exchange failed");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bank-config", buildingId] });
        },
    });
}

// ── Account Balance ───────────────────────────────────────────────────────────

export interface AccountBalance {
    available: number | null;
    current: number | null;
    currency: string;
    account_name: string | null;
    holder_name: string | null;
    refreshed_at: string | null;
}

export function useAccountBalance(buildingId: string | null, enabled = true) {
    return useQuery<AccountBalance>({
        queryKey: ["account-balance", buildingId],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/balance/${buildingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch balance");
            return res.json();
        },
        enabled: !!buildingId && enabled,
        staleTime: 1000 * 60 * 5,
    });
}

// ── Conciliation Mode ─────────────────────────────────────────────────────────

export interface UnitDebtItem {
    charge_id: string;
    concept: string;
    period: string;
    amount_clp: number;
    paid_amount: number;
    remaining: number;
    priority: number; // 1=multa, 2=interes, 3=ggcc_pendiente, 4=ggcc_corriente
}

export interface UnitWithPendingCharges {
    unit_id: string;
    unit_number: string;
    floor_number?: string;
    total_debt: number;
    charges: UnitDebtItem[];
}

export interface WaterfallAllocation {
    charge_id: string;
    charge_concept: string;
    amount_applied: number;
    new_status: string;
}

export interface WaterfallMatchResult {
    allocations: WaterfallAllocation[];
    total_applied: number;
    movement_status: string;
}

export function useUnitsWithPendingCharges(buildingId: string | null) {
    return useQuery<UnitWithPendingCharges[]>({
        queryKey: ["units-with-charges", buildingId],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/units-with-charges/${buildingId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch units with charges");
            return res.json();
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useWaterfallMatch(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation<WaterfallMatchResult, Error, { movement_id: string; unit_id: string }>({
        mutationFn: async (payload) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/match/waterfall`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Waterfall match failed");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
            queryClient.invalidateQueries({ queryKey: ["units-with-charges", buildingId] });
        },
    });
}

export function useMatchAsExpense(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation<{ status: string; expense_id: string }, Error, {
        movement_id: string;
        category: string;
        concept: string;
        building_id: string;
        period: string;
    }>({
        mutationFn: async (payload) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/match/expense`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Match as expense failed");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
        },
    });
}

export function useMatchAsOther(buildingId: string | null) {
    const queryClient = useQueryClient();
    return useMutation<{ status: string }, Error, { movement_id: string; label: string }>({
        mutationFn: async (payload) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/fintoc/match/other`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Match as other failed");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fintoc-movements", buildingId] });
        },
    });
}
