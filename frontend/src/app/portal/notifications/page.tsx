import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Comunicados — EdificioApp" };

const CATEGORY_ICONS: Record<string, string> = {
    general: "📢",
    maintenance: "🔧",
    financial: "💰",
    emergency: "🚨",
};

export default async function PortalNotificationsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: resident } = await supabase
        .from("residents")
        .select("id, unit_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

    // Get deliveries joined with notifications
    const { data: deliveries } = resident
        ? await supabase
            .from("notification_deliveries")
            .select("id, read_at, notifications(id, title, body, category, created_at)")
            .eq("resident_id", resident.id)
            .order("created_at", { referencedTable: "notifications", ascending: false })
        : { data: [] };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Comunicados</h1>
                    <p className="page-subtitle">Avisos de tu edificio</p>
                </div>
            </div>

            {(deliveries ?? []).length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔔</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No hay comunicados por el momento.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(deliveries ?? []).map((d: {
                        id: string;
                        read_at: string | null;
                        notifications: { id: string; title: string; body: string; category: string; created_at: string } | any;
                    }) => {
                        // Handle supabase array vs object bug
                        const n = Array.isArray(d.notifications) ? d.notifications[0] : d.notifications;
                        if (!n) return null;
                        const isUnread = !d.read_at;
                        return (
                            <div key={d.id} className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-start", borderLeft: isUnread ? "4px solid var(--color-primary)" : "4px solid transparent" }}>
                                <div style={{
                                    width: 40, height: 40, flexShrink: 0,
                                    background: "var(--color-primary-light)",
                                    borderRadius: "var(--radius-md)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "1.25rem",
                                }}>
                                    {CATEGORY_ICONS[n.category] ?? "📢"}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                        <span style={{ fontWeight: isUnread ? 700 : 600 }}>{n.title}</span>
                                        {isUnread && <span className="badge badge-primary" style={{ fontSize: "0.7rem" }}>Nuevo</span>}
                                    </div>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)", marginBottom: "0.5rem" }}>{n.body}</p>
                                    <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)" }}>
                                        {new Date(n.created_at).toLocaleString("es-CL")}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
