"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Poll {
    id: string;
    title: string;
    description: string;
    deadline: string;
    show_results_before_deadline: boolean;
    created_at: string;
    total_eligible?: number;
    votes_cast?: number;
    buildings?: { name: string };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PollsPage() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterBuilding, setFilterBuilding] = useState("");

    const fetchBuildings = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${API_URL}/api/buildings/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setBuildings(await res.json());
    }, []);

    const fetchPolls = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        let url = `${API_URL}/api/polls/`;
        if (filterBuilding) url += `?building_id=${filterBuilding}`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setPolls(await res.json());
        setLoading(false);
    }, [filterBuilding]);

    useEffect(() => {
        fetchBuildings();
    }, [fetchBuildings]);

    useEffect(() => {
        fetchPolls();
    }, [fetchPolls]);

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta votación?")) return;

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/polls/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
            fetchPolls();
        } else {
            alert("Error al eliminar la votación");
        }
    };

    const isExpired = (deadline: string) => new Date(deadline) < new Date();

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Votaciones</h1>
                    <p className="page-subtitle">Encuestas y votaciones para los residentes</p>
                </div>
                <a href="/admin/polls/new" className="btn btn-primary">
                    <span>🗳</span> Nueva Votación
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
                    {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                {filterBuilding && (
                    <button
                        className="btn btn-ghost"
                        onClick={() => setFilterBuilding("")}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando...</p>
            ) : polls.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🗳</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No se encontraron votaciones.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {polls.map(p => {
                        const expired = isExpired(p.deadline);
                        const progress = p.total_eligible
                            ? Math.round(((p.votes_cast || 0) / p.total_eligible) * 100)
                            : 0;

                        return (
                            <a
                                key={p.id}
                                href={`/admin/polls/${p.id}`}
                                style={{ textDecoration: "none", color: "inherit" }}
                            >
                                <div className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "center", padding: "1.25rem", cursor: "pointer", transition: "box-shadow 0.2s" }}>
                                    <div style={{
                                        width: 48, height: 48, flexShrink: 0,
                                        background: expired ? "var(--color-gray-100)" : "var(--color-primary-light)",
                                        borderRadius: "12px",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: "1.5rem",
                                    }}>
                                        🗳
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                            <span style={{ fontWeight: 600, fontSize: "1.125rem", color: "var(--color-gray-900)" }}>{p.title}</span>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: expired ? "var(--color-gray-100)" : "#dcfce7",
                                                    color: expired ? "var(--color-gray-500)" : "#166534",
                                                    fontSize: "0.7rem",
                                                }}
                                            >
                                                {expired ? "Finalizada" : "Activa"}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)", marginBottom: "0.75rem", lineHeight: "1.5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "500px" }}>
                                            {p.description}
                                        </p>
                                        <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span>📅 Cierre: {new Date(p.deadline).toLocaleDateString("es-CL")} {new Date(p.deadline).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                                            <span style={{ color: "var(--color-gray-300)" }}>•</span>
                                            <span style={{ fontWeight: 500, color: "var(--color-gray-700)" }}>🏢 {p.buildings?.name || "Edificio"}</span>
                                        </div>
                                    </div>

                                    {p.total_eligible !== undefined && (
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
                                                Participación
                                            </div>
                                            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-primary)" }}>
                                                {p.votes_cast || 0}
                                                <span style={{ color: "var(--color-gray-300)", fontWeight: 400, marginLeft: "0.25rem", fontSize: "1rem" }}>/ {p.total_eligible}</span>
                                            </div>
                                            {/* Progress bar */}
                                            <div style={{
                                                width: "100%",
                                                height: "4px",
                                                background: "var(--color-gray-100)",
                                                borderRadius: "2px",
                                                marginTop: "0.5rem",
                                                overflow: "hidden",
                                            }}>
                                                <div style={{
                                                    width: `${progress}%`,
                                                    height: "100%",
                                                    background: "var(--color-primary)",
                                                    borderRadius: "2px",
                                                    transition: "width 0.3s ease",
                                                }} />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleDelete(p.id);
                                        }}
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
                                        title="Eliminar votación"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
