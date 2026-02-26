import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Expense } from "@/lib/expenses-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useExpenses(buildingId: string | null, period: string | null) {
    return useQuery<Expense[]>({
        queryKey: ["expenses", buildingId, period],
        queryFn: async () => {
            if (!buildingId || !period) return [];
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const res = await fetch(`${API_URL}/api/expenses/?building_id=${buildingId}&period=${period}`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch expenses");
            return res.json();
        },
        enabled: !!buildingId && !!period,
    });
}
