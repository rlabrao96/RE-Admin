"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
    id: string;
    title: string;
    body: string;
    category: string;
    created_at: string;
    recipients_count?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CATEGORY_ICONS: Record<string, string> = {
    general: "📢",
    maintenance: "🔧",
    financial: "💰",
    emergency: "🚨",
};

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${API_URL}/api/notifications/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setNotifications(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Notificaciones</h1>
                    <p className="page-subtitle">Comunicados enviados a los residentes</p>
                </div>
                <a href="/admin/notifications/new" className="btn btn-primary">
                    <span>🔔</span> Nueva Notificación
                </a>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando...</p>
            ) : notifications.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔔</div>
                    <p style={{ color: "var(--color-gray-500)" }}>Aún no has enviado notificaciones.</p>
                    <a href="/admin/notifications/new" className="btn btn-primary" style={{ display: "inline-flex", marginTop: "1rem" }}>
                        Enviar primera notificación
                    </a>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {notifications.map(n => (
                        <div key={n.id} className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
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
                                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{n.title}</div>
                                <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)", marginBottom: "0.5rem" }}>{n.body}</p>
                                <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)" }}>
                                    {new Date(n.created_at).toLocaleString("es-CL")} · <span className="badge badge-primary">{n.category}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
