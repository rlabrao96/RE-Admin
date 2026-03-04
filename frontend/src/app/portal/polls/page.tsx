"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PollOption {
    id: string;
    label: string;
    display_order: number;
    vote_count?: number;
    percentage?: number;
}

interface Poll {
    id: string;
    title: string;
    description: string;
    deadline: string;
    show_results_before_deadline: boolean;
    created_at: string;
    poll_options: PollOption[];
    is_expired: boolean;
    has_voted: boolean;
    voted_option_id: string | null;
    total_votes?: number;
}

export default function PortalPollsPage() {
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
    const [pendingVote, setPendingVote] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [voting, setVoting] = useState(false);
    const [voteError, setVoteError] = useState<string | null>(null);

    const fetchPolls = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/polls/resident/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setPolls(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchPolls();
    }, [fetchPolls]);

    const openPoll = (poll: Poll) => {
        setSelectedPoll(poll);
        setPendingVote(null);
        setConfirming(false);
        setVoteError(null);
    };

    const closeModal = () => {
        setSelectedPoll(null);
        setPendingVote(null);
        setConfirming(false);
        setVoteError(null);
    };

    const handleSelectOption = (optionId: string) => {
        if (!selectedPoll || selectedPoll.has_voted || selectedPoll.is_expired) return;
        setPendingVote(optionId);
        setConfirming(true);
    };

    const handleConfirmVote = async () => {
        if (!selectedPoll || !pendingVote) return;
        setVoting(true);
        setVoteError(null);

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        try {
            const res = await fetch(`${API_URL}/api/polls/${selectedPoll.id}/vote`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ option_id: pendingVote }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al registrar el voto");

            // Update local state optimistically
            setPolls(prev => prev.map(p => {
                if (p.id !== selectedPoll.id) return p;
                return { ...p, has_voted: true, voted_option_id: pendingVote };
            }));
            setSelectedPoll(prev => prev ? { ...prev, has_voted: true, voted_option_id: pendingVote } : null);
            setConfirming(false);
            setPendingVote(null);
        } catch (err: unknown) {
            setVoteError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setVoting(false);
        }
    };

    const getPollStatus = (poll: Poll) => {
        if (poll.is_expired) return { label: "Finalizada", color: "var(--color-gray-500)", bg: "var(--color-gray-100)" };
        if (poll.has_voted) return { label: "Votado", color: "#166534", bg: "#dcfce7" };
        return { label: "Pendiente", color: "#92400e", bg: "#fef3c7" };
    };

    const sortedOptions = (poll: Poll) =>
        [...poll.poll_options].sort((a, b) => a.display_order - b.display_order);

    const showResults = (poll: Poll) =>
        poll.is_expired || poll.show_results_before_deadline;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Votaciones</h1>
                    <p className="page-subtitle">Votaciones activas de tu edificio</p>
                </div>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)", textAlign: "center", padding: "2rem" }}>Cargando votaciones...</p>
            ) : polls.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🗳</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No hay votaciones por el momento.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {polls.map(poll => {
                        const status = getPollStatus(poll);
                        return (
                            <div
                                key={poll.id}
                                className="card"
                                onClick={() => openPoll(poll)}
                                style={{
                                    display: "flex",
                                    gap: "1rem",
                                    alignItems: "center",
                                    borderLeft: !poll.has_voted && !poll.is_expired ? "4px solid var(--color-primary)" : "4px solid transparent",
                                    cursor: "pointer",
                                    transition: "background 0.2s",
                                }}
                            >
                                <div style={{
                                    width: 40, height: 40, flexShrink: 0,
                                    background: poll.is_expired ? "var(--color-gray-100)" : "var(--color-primary-light)",
                                    borderRadius: "var(--radius-md)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "1.25rem",
                                }}>
                                    🗳
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                        <span style={{ fontWeight: 600 }}>{poll.title}</span>
                                        <span
                                            className="badge"
                                            style={{ background: status.bg, color: status.color, fontSize: "0.7rem" }}
                                        >
                                            {status.label}
                                        </span>
                                    </div>
                                    <p style={{
                                        fontSize: "0.875rem",
                                        color: "var(--color-gray-600)",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        maxWidth: "400px",
                                    }}>
                                        {poll.description}
                                    </p>
                                    <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)", marginTop: "0.25rem" }}>
                                        Cierre: {new Date(poll.deadline).toLocaleString("es-CL")}
                                    </p>
                                </div>
                                <div style={{ color: "var(--color-gray-300)" }}>›</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Poll Modal */}
            {selectedPoll && (
                <div
                    style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        zIndex: 1000, padding: "1rem",
                    }}
                    onClick={closeModal}
                >
                    <div
                        className="card"
                        style={{ maxWidth: "520px", width: "100%", padding: "2rem", position: "relative", maxHeight: "90vh", overflowY: "auto" }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={closeModal}
                            style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--color-gray-400)" }}
                        >
                            ×
                        </button>

                        {/* Header */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                            <div style={{
                                width: 50, height: 50,
                                background: selectedPoll.is_expired ? "var(--color-gray-100)" : "var(--color-primary-light)",
                                borderRadius: "var(--radius-md)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem",
                                flexShrink: 0,
                            }}>
                                🗳
                            </div>
                            <div>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{selectedPoll.title}</h2>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", margin: 0 }}>
                                    Cierre: {new Date(selectedPoll.deadline).toLocaleString("es-CL")}
                                </p>
                            </div>
                        </div>

                        {/* Description */}
                        <div style={{
                            fontSize: "0.9375rem",
                            color: "var(--color-gray-700)",
                            lineHeight: "1.6",
                            marginBottom: "1.5rem",
                            whiteSpace: "pre-wrap",
                            background: "var(--color-gray-50)",
                            padding: "1rem",
                            borderRadius: "var(--radius-md)",
                        }}>
                            {selectedPoll.description}
                        </div>

                        {/* Confirmation dialog */}
                        {confirming && pendingVote && (
                            <div style={{
                                background: "#fffbeb",
                                border: "1px solid #f59e0b",
                                borderRadius: "var(--radius-md)",
                                padding: "1rem",
                                marginBottom: "1rem",
                            }}>
                                <p style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.5rem", color: "#92400e" }}>
                                    ¿Confirmas tu voto?
                                </p>
                                <p style={{ fontSize: "0.875rem", color: "#92400e", marginBottom: "1rem" }}>
                                    Votarás por: <strong>{sortedOptions(selectedPoll).find(o => o.id === pendingVote)?.label}</strong>
                                    <br />
                                    <span style={{ fontSize: "0.8125rem" }}>Tu voto es definitivo y no se puede cambiar.</span>
                                </p>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleConfirmVote}
                                        disabled={voting}
                                        style={{ flex: 1 }}
                                    >
                                        {voting ? "Registrando..." : "Confirmar voto"}
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => { setConfirming(false); setPendingVote(null); }}
                                        disabled={voting}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                                {voteError && (
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-danger)", marginTop: "0.5rem" }}>
                                        ⚠️ {voteError}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Already voted banner */}
                        {selectedPoll.has_voted && !confirming && (
                            <div style={{
                                background: "#f0fdf4",
                                border: "1px solid #86efac",
                                borderRadius: "var(--radius-md)",
                                padding: "0.75rem 1rem",
                                marginBottom: "1rem",
                                fontSize: "0.875rem",
                                color: "#166534",
                                fontWeight: 500,
                            }}>
                                ✅ Ya emitiste tu voto por: <strong>{sortedOptions(selectedPoll).find(o => o.id === selectedPoll.voted_option_id)?.label || "una opción"}</strong>
                            </div>
                        )}

                        {/* Options or Results */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {!showResults(selectedPoll) && !selectedPoll.has_voted ? (
                                // Vote interface
                                <>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>
                                        Selecciona tu opción:
                                    </p>
                                    {sortedOptions(selectedPoll).map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleSelectOption(opt.id)}
                                            disabled={confirming}
                                            style={{
                                                border: `2px solid ${pendingVote === opt.id ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                                background: pendingVote === opt.id ? "var(--color-primary-light)" : "white",
                                                borderRadius: "var(--radius-md)",
                                                padding: "0.875rem 1.25rem",
                                                textAlign: "left",
                                                cursor: "pointer",
                                                fontSize: "0.9375rem",
                                                fontWeight: pendingVote === opt.id ? 600 : 400,
                                                color: pendingVote === opt.id ? "var(--color-primary)" : "var(--color-gray-900)",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </>
                            ) : (
                                // Results view
                                <>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>
                                        {showResults(selectedPoll) ? "Resultados:" : "Opciones:"}
                                    </p>
                                    {sortedOptions(selectedPoll).map(opt => {
                                        const total = selectedPoll.total_votes || 0;
                                        const count = opt.vote_count || 0;
                                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                        const isVotedOption = selectedPoll.voted_option_id === opt.id;

                                        return (
                                            <div key={opt.id} style={{
                                                border: `2px solid ${isVotedOption ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                                borderRadius: "var(--radius-md)",
                                                padding: "0.875rem 1.25rem",
                                                background: isVotedOption ? "var(--color-primary-light)" : "white",
                                            }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                                    <span style={{ fontWeight: isVotedOption ? 700 : 500 }}>
                                                        {opt.label}
                                                        {isVotedOption && <span style={{ marginLeft: "0.5rem", fontSize: "0.8125rem" }}>← tu voto</span>}
                                                    </span>
                                                    {showResults(selectedPoll) && (
                                                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                                                            {count} ({pct}%)
                                                        </span>
                                                    )}
                                                </div>
                                                {showResults(selectedPoll) && (
                                                    <div style={{ width: "100%", height: "6px", background: "var(--color-gray-100)", borderRadius: "3px", overflow: "hidden" }}>
                                                        <div style={{
                                                            width: `${pct}%`,
                                                            height: "100%",
                                                            background: isVotedOption ? "var(--color-primary)" : "var(--color-gray-400)",
                                                            borderRadius: "3px",
                                                            transition: "width 0.3s ease",
                                                        }} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {showResults(selectedPoll) && selectedPoll.total_votes !== undefined && (
                                        <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)", textAlign: "right", marginTop: "0.25rem" }}>
                                            Total de votos: {selectedPoll.total_votes}
                                        </p>
                                    )}
                                    {!showResults(selectedPoll) && !selectedPoll.is_expired && selectedPoll.has_voted && (
                                        <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", textAlign: "center" }}>
                                            Los resultados estarán disponibles cuando cierre la votación.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {selectedPoll.is_expired && (
                            <div style={{
                                marginTop: "1rem",
                                padding: "0.625rem",
                                background: "var(--color-gray-50)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "0.8125rem",
                                color: "var(--color-gray-500)",
                                textAlign: "center",
                            }}>
                                Esta votación ha finalizado
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
