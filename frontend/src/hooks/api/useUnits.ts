import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Unit {
    id: string;
    number: string;
    type: string;
    alicuota: number;
    floor_id: string;
    surface_m2: number;
    residents?: Array<{
        is_owner: boolean;
        profiles: {
            full_name: string;
            email: string;
        }
    }>;
}

export interface FloorWithUnits {
    floor: {
        id: string;
        number: number;
    };
    units: Unit[];
}

export function useUnits(buildingId: string | null) {
    return useQuery<FloorWithUnits[]>({
        queryKey: ["units", buildingId],
        queryFn: async () => {
            if (!buildingId) return [];
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const res = await fetch(`${API_URL}/api/buildings/${buildingId}/units`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch units");
            return res.json();
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 15, // 15 minutes — units change occasionally
    });
}
