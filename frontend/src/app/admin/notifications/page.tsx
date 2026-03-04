"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "@/hooks/api/useNotifications";
import { useBuildings } from "@/hooks/api/useBuildings";

interface Notification {
    id: string;
    title: string;
    body: string;
    category: string;
    created_at: string;
    read_count?: number;
    total_count?: number;
    buildings?: { name: string };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CATEGORY_ICONS: Record<string, string> = {
    general: "📢",
    maintenance: "🔧",
    financial: "💰",
    emergency: "🚨",
};

export default function NotificationsPage() {
    const queryClient = useQueryClient();
    const [filterBuilding, setFilterBuilding] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [filterMonth, setFilterMonth] = useState("");

    // Buildings — already cached by useBuildings hook
    const { data: buildings = [] } = useBuildings();

    // Notifications — cached by React Query, instant on revisit
    const { data: notifications = [], isLoading } = useNotifications({
        buildingId: filterBuilding,
        category: filterCategory,
        month: filterMonth,
    });

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta notificación?")) return;

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/notifications/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
            // Invalidate cache so list refreshes
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        } else {
            alert("Error al eliminar la notificación");
        }
    };

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

            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center" }}>
                <select
                    className="form-input"
                    style={{ width: "auto", minWidth: "200px" }}
                    value={filterBuilding}
                    onChange={(e) => setFilterBuilding(e.target.value)}
                >
                    <option value="">Todos los edificios</option>
                    {(buildings as any[]).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                <select
                    className="form-input"
                    style={{ width: "auto", minWidth: "180px" }}
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                >
                    <option value="">Todas las categorías</option>
                    <option value="general">📢 General</option>
                    <option value="maintenance">🔧 Mantenimiento</option>
                    <option value="financial">💰 Financiero</option>
                    <option value="emergency">🚨 Emergencia</option>
                </select>

                <input
                    type="month"
                    className="form-input"
                    style={{ width: "auto" }}
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                />

                {(filterBuilding || filterCategory || filterMonth) && (
                    <button
                        className="btn btn-ghost"
                        onClick={() => {
                            setFilterBuilding("");
                            setFilterCategory("");
                            setFilterMonth("");
                        }}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {isLoading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando...</p>
            ) : (notifications as Notification[]).length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔔</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No se encontraron notificaciones con los filtros aplicados.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {(notifications as Notification[]).map(n => (
                        <div key={n.id} className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "center", padding: "1.25rem" }}>
                            <div style={{
                                width: 48, height: 48, flexShrink: 0,
                                background: "var(--color-primary-light)",
                                borderRadius: "12px",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem",
                            }}>
                                {CATEGORY_ICONS[n.category] ?? "📢"}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "1.125rem", marginBottom: "0.25rem", color: "var(--color-gray-900)" }}>{n.title}</div>
                                <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)", marginBottom: "0.75rem", lineHeight: "1.5" }}>{n.body}</p>
                                <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                        📅 {new Date(n.created_at).toLocaleDateString("es-CL")} {new Date(n.created_at).toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span style={{ color: "var(--color-gray-300)" }}>•</span>
                                    <span style={{ fontWeight: 500, color: "var(--color-gray-700)" }}>🏢 {n.buildings?.name || "Edificio"}</span>
                                    <span style={{ color: "var(--color-gray-300)" }}>•</span>
                                    <span className="badge badge-primary" style={{ textTransform: "capitalize" }}>{n.category}</span>
                                </div>
                            </div>

                            {n.total_count !== undefined && (
                                <div style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: "140px",
                                    paddingLeft: "1.5rem",
                                    borderLeft: "1px solid var(--color-gray-100)",
                                    textAlign: "center"
                                }}>
                                    <div style={{
                                        fontSize: "0.7rem",
                                        color: "var(--color-gray-400)",
                                        textTransform: "uppercase",
                                        fontWeight: 700,
                                        letterSpacing: "0.05em",
                                        marginBottom: "0.25rem"
                                    }}>
                                        Leídas / Total
                                    </div>
                                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-primary)" }}>
                                        {n.read_count}
                                        <span style={{ color: "var(--color-gray-300)", fontWeight: 400, marginLeft: "0.25rem", fontSize: "1rem" }}>/ {n.total_count}</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => handleDelete(n.id)}
                                style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    color: "var(--color-danger)", fontSize: "1.25rem",
                                    padding: "0.75rem", opacity: 0.6,
                                    borderRadius: "var(--radius-md)",
                                    transition: "all 0.2s ease",
                                    display: "flex", alignItems: "center", justifyContent: "center"
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                    e.currentTarget.style.background = "#fff5f5";
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.opacity = "0.6";
                                    e.currentTarget.style.background = "none";
                                }}
                                title="Eliminar notificación"
                            >
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
