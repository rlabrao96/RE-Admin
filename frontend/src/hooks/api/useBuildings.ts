import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Building {
    id: string;
    name: string;
    address?: string;
    commune?: string;
    region?: string;
    rut_edificio?: string;
    interest_rate_percent?: number;
    grace_period_days?: number;
    late_payment_fine_utm?: number;
    due_day?: number;
}

export function useBuildings() {
    return useQuery<Building[]>({
        queryKey: ["buildings"],
        queryFn: async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const res = await fetch(`${API_URL}/api/buildings/`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch buildings");
            return res.json();
        },
        staleTime: 1000 * 60 * 30, // 30 minutes — buildings rarely change
    });
}
