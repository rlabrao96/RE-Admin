import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ChargeSummary {
    building_id: string;
    building_name: string;
    period: string;
    total_amount: number;
    paid_amount: number;
    paid_count: number;
    total_count: number;
    percent_paid: number;
}

export function useChargeSummaries() {
    return useQuery<ChargeSummary[]>({
        queryKey: ["charge-summaries"],
        queryFn: async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const res = await fetch(`${API_URL}/api/charges/summary`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch charge summaries");
            return res.json();
        },
    });
}
