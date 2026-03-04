import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getToken() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No session");
    return session.access_token;
}

export interface PollOption {
    id: string;
    poll_id: string;
    label: string;
    display_order: number;
    vote_count?: number;
    percentage?: number;
}

export interface Poll {
    id: string;
    building_id: string;
    title: string;
    description: string;
    show_results_before_deadline: boolean;
    deadline: string;
    created_by: string;
    created_at: string;
    buildings?: { id: string; name: string };
    total_eligible?: number;
    votes_cast?: number;
    // Resident-specific fields
    poll_options?: PollOption[];
    is_expired?: boolean;
    has_voted?: boolean;
    voted_option_id?: string | null;
    total_votes?: number;
}

export interface PollDetail extends Poll {
    options: (PollOption & { vote_count: number })[];
    votes: any[];
    units_status: {
        unit_id: string;
        unit_number: string;
        floor_number: number;
        has_voted: boolean;
    }[];
}

// Admin: list polls
export function useAdminPolls(buildingId?: string) {
    return useQuery<Poll[]>({
        queryKey: ["admin-polls", buildingId],
        queryFn: async () => {
            const token = await getToken();
            const url = buildingId
                ? `${API_URL}/api/polls/?building_id=${buildingId}`
                : `${API_URL}/api/polls/`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch polls");
            return res.json();
        },
        staleTime: 1000 * 60 * 3, // 3 minutes
    });
}

// Admin: poll detail
export function useAdminPollDetail(pollId: string | null) {
    return useQuery<PollDetail>({
        queryKey: ["admin-poll-detail", pollId],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/polls/${pollId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch poll detail");
            return res.json();
        },
        enabled: !!pollId,
        staleTime: 1000 * 60 * 1, // 1 minute — admin wants fresh vote data
    });
}

// Resident: list polls
export function useResidentPolls() {
    return useQuery<Poll[]>({
        queryKey: ["resident-polls"],
        queryFn: async () => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/polls/resident/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch polls");
            return res.json();
        },
        staleTime: 1000 * 60 * 3,
    });
}

// Resident: cast vote
export function useCastVote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/polls/${pollId}/vote`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ option_id: optionId }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Error al votar");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["resident-polls"] });
        },
    });
}
