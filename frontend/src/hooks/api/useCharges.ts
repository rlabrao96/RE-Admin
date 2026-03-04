import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Charge {
    id: string;
    unit_id: string;
    concept: string;
    period: string;
    amount_clp: number;
    due_date: string;
    status: "pending" | "paid" | "overdue";
    paid_at?: string;
    amount_utm?: number;
    units: {
        number: string;
        residents: Array<{
            is_owner: boolean;
            profiles: {
                full_name: string;
                email: string;
            }
        }>;
    }
}

export function useCharges(buildingId: string | null, period: string | null) {
    return useQuery<Charge[]>({
        queryKey: ["charges", buildingId, period],
        queryFn: async () => {
            if (!buildingId) return [];
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            // If no period, fetch ALL charges for this building (for reports/debt analysis)
            if (!period) {
                const res = await fetch(`${API_URL}/api/charges/?building_id=${buildingId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (!res.ok) throw new Error("Failed to fetch all charges");
                return res.json();
            }

            // Fetch current period charges AND all past charges in parallel
            const [resCurr, resPast] = await Promise.all([
                fetch(`${API_URL}/api/charges/?building_id=${buildingId}&period=${period}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                }),
                fetch(`${API_URL}/api/charges/?building_id=${buildingId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                }),
            ]);

            if (!resCurr.ok || !resPast.ok) throw new Error("Failed to fetch charges");

            const [dataCurr, dataPast] = await Promise.all([resCurr.json(), resPast.json()]);

            // Helper: A past charge counts as debt for the CURRENT viewed period if it 
            // was unpaid at the time this period started.
            const isPendingForPeriod = (c: any, targetPeriod: string) => {
                if (c.period >= targetPeriod) return false;
                if (c.status === "pending") return true;
                if (c.status === "paid" && c.paid_at) {
                    const paidMonth = c.paid_at.substring(0, 7);
                    return paidMonth >= targetPeriod;
                }
                return false;
            };

            const existingIds = new Set(dataCurr.map((c: any) => c.id));
            const activePastCharges = dataPast.filter((c: any) =>
                !existingIds.has(c.id) && isPendingForPeriod(c, period)
            );

            return [...dataCurr, ...activePastCharges];
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 3, // 3 minutes — charges change frequently
    });
}

export function useUpdateChargeStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ ids, newStatus, period }: { ids: string[]; newStatus: string; period: string }) => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            await Promise.all(
                ids.map(id =>
                    fetch(`${API_URL}/api/charges/${id}?status=${newStatus}&context_period=${period}`, {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    })
                )
            );
        },
        // Optimistic UI implementation
        onMutate: async ({ ids, newStatus, period }) => {
            // Find all queries that might contain this charge
            // In this app, charges are grouped by building and period
            // but the same charge might appear in multiple period views (as debt)
            // For simplicity, we'll invalidate and use optimistic update for the current view

            // We don't have buildingId here easily, but we can find queries in cache
            const queryKeys = queryClient.getQueryCache().findAll({ queryKey: ["charges"] });

            // Snapshot current values
            const previousQueries = queryKeys.map(query => ({
                queryKey: query.queryKey,
                data: query.state.data
            }));

            const idSet = new Set(ids);

            // Optimistically update all charges queries in cache
            queryKeys.forEach(query => {
                queryClient.setQueryData(query.queryKey, (old: Charge[] | undefined) => {
                    if (!old) return old;
                    return old.map(c => idSet.has(c.id) ? { ...c, status: newStatus as any } : c);
                });
            });

            return { previousQueries };
        },
        onError: (err, variables, context) => {
            // Rollback on error
            context?.previousQueries.forEach(prev => {
                queryClient.setQueryData(prev.queryKey, prev.data);
            });
        },
        onSettled: (data, error, variables) => {
            // Refetch to sync with server
            queryClient.invalidateQueries({ queryKey: ["charges"] });
            queryClient.invalidateQueries({ queryKey: ["charge-summaries"] });
        },
    });
}
