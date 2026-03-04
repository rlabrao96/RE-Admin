import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useDocuments(buildingId?: string) {
    return useQuery({
        queryKey: ["documents", buildingId || "all"],
        queryFn: async () => {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("No session active. Please login.");

                let url = `${API_URL}/api/documents/admin/all`;
                if (buildingId) {
                    url = `${API_URL}/api/documents/building/${buildingId}`;
                }

                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Accept": "application/json"
                    },
                });

                const contentType = res.headers.get("content-type");

                if (!res.ok) {
                    let msg = `Server error (${res.status})`;
                    if (contentType && contentType.includes("application/json")) {
                        try {
                            const err = await res.json();
                            msg = err.detail || msg;
                        } catch (e) {
                            msg = `Error parsing JSON response (${res.status})`;
                        }
                    } else {
                        const text = await res.text();
                        msg = text.substring(0, 100) || msg;
                    }
                    throw new Error(msg);
                }

                if (contentType && contentType.includes("application/json")) {
                    return res.json();
                } else {
                    throw new Error("Invalid response from server (not JSON)");
                }
            } catch (err: any) {
                console.error("useDocuments hook error:", err);
                // Propagate either the network error or our custom error
                throw new Error(err.message || "Network error or fetch failed");
            }
        },
        retry: 1,
    });
}
