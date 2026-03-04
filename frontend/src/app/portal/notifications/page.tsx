"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const CATEGORY_ICONS: Record<string, string> = {
    general: "📢",
    maintenance: "🔧",
    financial: "💰",
    emergency: "🚨",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PortalNotificationsPage() {
    const [deliveries, setDeliveries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNotification, setSelectedNotification] = useState<any>(null);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Note: Using a direct fetch for deliveries instead of server-side to handle interactions
        // We'll query resident first
        const { data: resident } = await supabase
            .from("residents")
            .select("id")
            .eq("user_id", session.user.id)
            .eq("status", "active")
            .maybeSingle();

        if (resident) {
            const { data } = await supabase
                .from("notification_deliveries")
                .select(`
                    read_at, 
                    notifications!inner(id, title, body, category, created_at)
                `)
                .eq("resident_id", resident.id)
                .order("read_at", { ascending: true })
                .order("notifications(created_at)", { ascending: false });

            setDeliveries(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleMarkAsRead = async (notificationId: string, currentReadAt: string | null) => {
        if (currentReadAt) return; // Already read

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        try {
            const res = await fetch(`${API_URL}/api/notifications/deliveries/${notificationId}/read`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (res.ok) {
                // Optimistic update
                setDeliveries(prev => prev.map(d => {
                    const n = Array.isArray(d.notifications) ? d.notifications[0] : d.notifications;
                    if (n.id === notificationId) {
                        return { ...d, read_at: new Date().toISOString() };
                    }
                    return d;
                }));
            }
        } catch (err) {
            console.error("Error marking as read:", err);
        }
    };

    const openModal = (d: any) => {
        const n = Array.isArray(d.notifications) ? d.notifications[0] : d.notifications;
        setSelectedNotification({ ...n, read_at: d.read_at });
        if (!d.read_at) {
            handleMarkAsRead(n.id, d.read_at);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Comunicados</h1>
                    <p className="page-subtitle">Avisos de tu edificio</p>
                </div>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)", textAlign: "center", padding: "2rem" }}>Cargando comunicados...</p>
            ) : deliveries.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔔</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No hay comunicados por el momento.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {deliveries.map((d: any) => {
                        const n = Array.isArray(d.notifications) ? d.notifications[0] : d.notifications;
                        if (!n) return null;
                        const isUnread = !d.read_at;
                        return (
                            <div
                                key={n.id}
                                className="card"
                                onClick={() => openModal(d)}
                                style={{
                                    display: "flex",
                                    gap: "1rem",
                                    alignItems: "center",
                                    borderLeft: isUnread ? "4px solid var(--color-primary)" : "4px solid transparent",
                                    cursor: "pointer",
                                    transition: "background 0.2s"
                                }}
                            >
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
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "400px" }}>
                                        {n.body}
                                    </p>
                                    <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)" }}>
                                        {new Date(n.created_at).toLocaleString("es-CL")}
                                    </p>
                                </div>
                                <div style={{ color: "var(--color-gray-300)" }}>›</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Notification Modal */}
            {selectedNotification && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1000, padding: "1rem"
                }} onClick={() => setSelectedNotification(null)}>
                    <div className="card" style={{ maxWidth: "500px", width: "100%", padding: "2rem", position: "relative" }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedNotification(null)}
                            style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--color-gray-400)" }}
                        >
                            ×
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                            <div style={{
                                width: 50, height: 50,
                                background: "var(--color-primary-light)",
                                borderRadius: "var(--radius-md)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem",
                            }}>
                                {CATEGORY_ICONS[selectedNotification.category] ?? "📢"}
                            </div>
                            <div>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{selectedNotification.title}</h2>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", margin: 0 }}>
                                    {new Date(selectedNotification.created_at).toLocaleString("es-CL")} · <span style={{ textTransform: "capitalize" }}>{selectedNotification.category}</span>
                                </p>
                            </div>
                        </div>
                        <div style={{ fontSize: "1rem", color: "var(--color-gray-700)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                            {selectedNotification.body}
                        </div>
                        <div style={{ marginTop: "2rem", textAlign: "right" }}>
                            <button className="btn btn-primary" onClick={() => setSelectedNotification(null)}>Entendido</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
