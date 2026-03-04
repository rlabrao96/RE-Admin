import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Building } from "./useBuildings";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useBuilding(buildingId: string | null) {
    return useQuery<Building>({
        queryKey: ["building", buildingId],
        queryFn: async () => {
            if (!buildingId) throw new Error("No building ID");
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No session");

            const res = await fetch(`${API_URL}/api/buildings/${buildingId}`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch building");
            return res.json();
        },
        enabled: !!buildingId,
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
}
