"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PollOption {
    id: string;
    label: string;
    display_order: number;
    vote_count: number;
}

interface UnitStatus {
    unit_id: string;
    unit_number: string;
    floor_number: number;
    has_voted: boolean;
}

interface PollDetail {
    id: string;
    title: string;
    description: string;
    deadline: string;
    show_results_before_deadline: boolean;
    created_at: string;
    buildings?: { name: string };
    options: PollOption[];
    total_eligible: number;
    votes_cast: number;
    units_status: UnitStatus[];
}

export default function PollDetailPage() {
    const params = useParams();
    const pollId = params.id as string;
    const [poll, setPoll] = useState<PollDetail | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchPoll = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/polls/${pollId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setPoll(await res.json());
        setLoading(false);
    }, [pollId]);

    useEffect(() => {
        fetchPoll();
    }, [fetchPoll]);

    if (loading) {
        return <p style={{ color: "var(--color-gray-500)" }}>Cargando...</p>;
    }

    if (!poll) {
        return (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                <p style={{ color: "var(--color-gray-500)" }}>Votación no encontrada.</p>
            </div>
        );
    }

    const isExpired = new Date(poll.deadline) < new Date();
    const totalVotes = poll.votes_cast;
    const maxVotes = Math.max(...poll.options.map(o => o.vote_count), 1);

    return (
        <div>
            <div className="page-header">
                <div>
                    <a href="/admin/polls" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver a Votaciones
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>{poll.title}</h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <span
                            className="badge"
                            style={{
                                background: isExpired ? "var(--color-gray-100)" : "#dcfce7",
                                color: isExpired ? "var(--color-gray-500)" : "#166534",
                            }}
                        >
                            {isExpired ? "Finalizada" : "Activa"}
                        </span>
                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                            🏢 {poll.buildings?.name || "Edificio"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description & metadata */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
                <p style={{ color: "var(--color-gray-700)", lineHeight: "1.6", marginBottom: "1rem", whiteSpace: "pre-wrap" }}>
                    {poll.description}
                </p>
                <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                    <span>📅 Cierre: {new Date(poll.deadline).toLocaleString("es-CL")}</span>
                    <span>👁 Resultados visibles: {poll.show_results_before_deadline ? "Sí" : "Solo al cerrar"}</span>
                </div>
            </div>

            {/* Results */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div className="card">
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--color-gray-900)" }}>
                        Resultados
                    </h2>
                    <div style={{ marginBottom: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "0.5rem" }}>
                            <span>Participación</span>
                            <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                                {poll.votes_cast} / {poll.total_eligible}
                                {poll.total_eligible > 0 && (
                                    <span style={{ color: "var(--color-gray-400)", fontWeight: 400 }}>
                                        {" "}({Math.round((poll.votes_cast / poll.total_eligible) * 100)}%)
                                    </span>
                                )}
                            </span>
                        </div>
                        <div style={{
                            width: "100%",
                            height: "6px",
                            background: "var(--color-gray-100)",
                            borderRadius: "3px",
                            overflow: "hidden",
                        }}>
                            <div style={{
                                width: poll.total_eligible > 0 ? `${(poll.votes_cast / poll.total_eligible) * 100}%` : "0%",
                                height: "100%",
                                background: "var(--color-primary)",
                                borderRadius: "3px",
                                transition: "width 0.3s ease",
                            }} />
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        {poll.options.map(opt => {
                            const percentage = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
                            return (
                                <div key={opt.id}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                                        <span style={{ fontWeight: 500, fontSize: "0.9375rem" }}>{opt.label}</span>
                                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                                            {opt.vote_count} voto{opt.vote_count !== 1 ? "s" : ""} ({percentage}%)
                                        </span>
                                    </div>
                                    <div style={{
                                        width: "100%",
                                        height: "24px",
                                        background: "var(--color-gray-100)",
                                        borderRadius: "var(--radius-md)",
                                        overflow: "hidden",
                                    }}>
                                        <div style={{
                                            width: maxVotes > 0 ? `${(opt.vote_count / maxVotes) * 100}%` : "0%",
                                            height: "100%",
                                            background: "var(--color-primary)",
                                            borderRadius: "var(--radius-md)",
                                            transition: "width 0.3s ease",
                                            minWidth: opt.vote_count > 0 ? "4px" : "0",
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Units participation */}
                <div className="card">
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--color-gray-900)" }}>
                        Participación por Unidad
                    </h2>
                    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                                    <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--color-gray-500)", fontWeight: 600, fontSize: "0.8125rem" }}>Piso</th>
                                    <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--color-gray-500)", fontWeight: 600, fontSize: "0.8125rem" }}>Unidad</th>
                                    <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--color-gray-500)", fontWeight: 600, fontSize: "0.8125rem" }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {poll.units_status.map(u => (
                                    <tr key={u.unit_id} style={{ borderBottom: "1px solid var(--color-gray-50)" }}>
                                        <td style={{ padding: "0.5rem 0.75rem" }}>{u.floor_number}</td>
                                        <td style={{ padding: "0.5rem 0.75rem" }}>{u.unit_number}</td>
                                        <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: u.has_voted ? "#dcfce7" : "var(--color-gray-100)",
                                                    color: u.has_voted ? "#166534" : "var(--color-gray-500)",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                {u.has_voted ? "Votó" : "Pendiente"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
