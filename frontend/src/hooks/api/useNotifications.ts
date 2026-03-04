import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface NotificationFilters {
    buildingId?: string;
    category?: string;
    month?: string;
}

async function fetchNotifications(filters: NotificationFilters) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No session active.");

    let url = `${API_URL}/api/notifications/?`;
    if (filters.buildingId) url += `building_id=${filters.buildingId}&`;
    if (filters.category) url += `category=${filters.category}&`;
    if (filters.month) url += `month=${filters.month}&`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Error fetching notifications: ${res.status}`);
    return res.json();
}

export function useNotifications(filters: NotificationFilters = {}) {
    return useQuery({
        queryKey: ["notifications", filters.buildingId || "all", filters.category || "", filters.month || ""],
        queryFn: () => fetchNotifications(filters),
        staleTime: 1000 * 60 * 2, // 2 minutes — avoids re-fetch on tab switch
        placeholderData: (prev) => prev, // show stale data while re-fetching (no spinner flicker)
    });
}

export function useInvalidateNotifications() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
}
