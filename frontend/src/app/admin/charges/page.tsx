"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useBuildings } from "@/hooks/api/useBuildings";
import { useChargeSummaries } from "@/hooks/api/useChargeSummaries";

interface ChargeSummary {
    building_id: string;
    building_name: string;
    period: string;
    total_amount: number;
    paid_amount: number;
    paid_count: number;
    total_count: number;
    percent_paid: number;
}

interface Building {
    id: string;
    name: string;
}

interface ModifyModal {
    building_id: string;
    period: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatCLP(amount: number) {
    return `$${amount.toLocaleString("es-CL")}`;
}

export default function ChargesPage() {
    const queryClient = useQueryClient();
    const { data: buildings = [], isLoading: buildingsLoading } = useBuildings();
    const { data: summaries = [], isLoading: summariesLoading, refetch: fetchSummaries } = useChargeSummaries();

    const [filterBuilding, setFilterBuilding] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("");

    const loading = buildingsLoading || summariesLoading;

    // Prefetch each building's latest period charges so detail page opens instantly
    useEffect(() => {
        if (summaries.length === 0) return;

        const latestByBuilding: Record<string, string> = {};
        summaries.forEach((s: ChargeSummary) => {
            if (!latestByBuilding[s.building_id] || s.period > latestByBuilding[s.building_id]) {
                latestByBuilding[s.building_id] = s.period;
            }
        });

        async function prefetchAll() {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            Object.entries(latestByBuilding).forEach(([buildingId, period]) => {
                queryClient.prefetchQuery({
                    queryKey: ["charges", buildingId, period],
                    queryFn: async () => {
                        const [resCurr, resPast] = await Promise.all([
                            fetch(`${API_URL}/api/charges/?building_id=${buildingId}&period=${period}`, {
                                headers: { Authorization: `Bearer ${session.access_token}` },
                            }),
                            fetch(`${API_URL}/api/charges/?building_id=${buildingId}`, {
                                headers: { Authorization: `Bearer ${session.access_token}` },
                            }),
                        ]);
                        if (!resCurr.ok || !resPast.ok) return [];
                        const [dataCurr, dataPast] = await Promise.all([resCurr.json(), resPast.json()]);
                        const isPendingForPeriod = (c: any, p: string) => {
                            if (c.period >= p) return false;
                            if (c.status === "pending") return true;
                            if (c.status === "paid" && c.paid_at) return c.paid_at.substring(0, 7) >= p;
                            return false;
                        };
                        const existingIds = new Set(dataCurr.map((c: any) => c.id));
                        return [...dataCurr, ...dataPast.filter((c: any) => !existingIds.has(c.id) && isPendingForPeriod(c, period))];
                    },
                    staleTime: 1000 * 60 * 3,
                });
            });
        }

        prefetchAll();
    }, [summaries, queryClient]);
    const [modifyModal, setModifyModal] = useState<ModifyModal | null>(null);
    const [modifyLoading, setModifyLoading] = useState(false);
    const [modifyForm, setModifyForm] = useState({
        new_base_amount: "",
        new_due_date: "",
        new_concept: "",
    });


    const handleDelete = async (building_id: string, period: string) => {
        if (!confirm(`¿Estás seguro de que deseas eliminar TODOS los cobros de ${period}? Esta acción no se puede deshacer.`)) return;

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/charges/bulk-delete?building_id=${building_id}&period=${period}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
            fetchSummaries();
        } else {
            const err = await res.json();
            alert(err.detail || "Error al eliminar");
        }
    };

    const openModifyModal = (building_id: string, period: string) => {
        setModifyModal({ building_id, period });
        setModifyForm({ new_base_amount: "", new_due_date: "", new_concept: "" });
    };

    const handleModify = async () => {
        if (!modifyModal) return;
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        setModifyLoading(true);
        const body: Record<string, string | number> = {
            building_id: modifyModal.building_id,
            period: modifyModal.period,
        };
        if (modifyForm.new_base_amount) body.new_base_amount = parseInt(modifyForm.new_base_amount);
        if (modifyForm.new_due_date) body.new_due_date = modifyForm.new_due_date;
        if (modifyForm.new_concept) body.new_concept = modifyForm.new_concept;

        const res = await fetch(`${API_URL}/api/charges/bulk-modify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        setModifyLoading(false);
        if (res.ok) {
            setModifyModal(null);
            fetchSummaries();
        } else {
            const err = await res.json();
            alert(err.detail || "Error al modificar");
        }
    };

    const filteredSummaries = summaries.filter((s: ChargeSummary) => {
        if (filterBuilding && s.building_id !== filterBuilding) return false;
        if (filterPeriod && !s.period.includes(filterPeriod)) return false;
        return true;
    });

    // To prevent historical data from inflating the top summary cards (like showing 2/8 units instead of 0/4),
    // we only sum statistics for the LATEST period of each building that matches the filters.
    const latestSummariesByBuilding = Object.values(
        filteredSummaries.reduce((acc: Record<string, ChargeSummary>, curr: ChargeSummary) => {
            if (!acc[curr.building_id] || curr.period > acc[curr.building_id].period) {
                acc[curr.building_id] = curr;
            }
            return acc;
        }, {} as Record<string, ChargeSummary>)
    );

    const totalAmount = latestSummariesByBuilding.reduce((s: number, item: ChargeSummary) => s + item.total_amount, 0);
    const totalPaidCount = latestSummariesByBuilding.reduce((s: number, item: ChargeSummary) => s + item.paid_count, 0);
    const totalCount = latestSummariesByBuilding.reduce((s: number, item: ChargeSummary) => s + item.total_count, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Gastos Comunes</h1>
                    <p className="page-subtitle">Gestiona los cobros agrupados por edificio y período</p>
                </div>
                <a href="/admin/charges/generate" className="btn btn-primary">
                    <span>📋</span> Generar Cobros
                </a>
            </div>

            {/* Summary Stats */}
            <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
                <div className="stat-card">
                    <span className="stat-label">Total en Cobro</span>
                    <span className="stat-value">{formatCLP(totalAmount)}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Unidades al Día</span>
                    <span className="stat-value" style={{ color: "var(--color-success)" }}>
                        {totalPaidCount} / {totalCount}
                    </span>
                    <span className="stat-sublabel">
                        {totalCount > 0 ? Math.round((totalPaidCount / totalCount) * 100) : 0}% de recaudación
                    </span>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                <select
                    className="form-input"
                    style={{ width: "auto", minWidth: "200px" }}
                    value={filterBuilding}
                    onChange={e => setFilterBuilding(e.target.value)}
                >
                    <option value="">Todos los edificios</option>
                    {buildings.map((b: Building) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
                <input
                    className="form-input"
                    type="month"
                    style={{ width: "auto" }}
                    value={filterPeriod}
                    onChange={e => setFilterPeriod(e.target.value)}
                />
                {(filterBuilding || filterPeriod) && (
                    <button className="btn btn-ghost" onClick={() => { setFilterBuilding(""); setFilterPeriod(""); }}>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando resumen...</p>
                ) : filteredSummaries.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📋</div>
                        <p style={{ color: "var(--color-gray-500)" }}>No se encontraron cobros para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Edificio</th>
                                <th>Período</th>
                                <th>Monto Total</th>
                                <th>Progreso</th>
                                <th style={{ textAlign: "right" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSummaries.map((s: ChargeSummary) => (
                                <tr key={`${s.building_id}-${s.period}`}>
                                    <td style={{ fontWeight: 500 }}>{s.building_name}</td>
                                    <td>{s.period}</td>
                                    <td style={{ fontWeight: 600 }}>{formatCLP(s.total_amount)}</td>
                                    <td>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                            <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-primary)" }}>
                                                {formatCLP(s.paid_amount)} / {formatCLP(s.total_amount)}
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                <div style={{ width: "80px", height: "8px", borderRadius: "4px", backgroundColor: "#e5e7eb", overflow: "hidden" }}>
                                                    <div style={{
                                                        width: `${s.percent_paid}%`,
                                                        height: "100%",
                                                        backgroundColor: s.percent_paid === 100 ? "var(--color-success)" : "var(--color-primary)"
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                                                    {s.paid_count}/{s.total_count} unidades
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "flex-end" }}>
                                            {/* Check if archived (older than building's latest period) */}
                                            {(latestSummariesByBuilding.find((ls: ChargeSummary) => ls.building_id === s.building_id)?.period || "") > s.period && (
                                                <span className="badge" style={{ background: "var(--color-gray-100)", color: "var(--color-gray-600)", border: "1px solid var(--color-gray-200)", fontSize: "0.6rem", padding: "0.15rem 0.4rem" }}>
                                                    ARCHIVO
                                                </span>
                                            )}
                                            <a
                                                href={`/admin/charges/detail?building_id=${s.building_id}&period=${s.period}`}
                                                className="btn btn-sm btn-ghost"
                                                title="Ver detalle por unidad"
                                            >
                                                👁️ Ver
                                            </a>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                title="Modificar grupo"
                                                onClick={() => openModifyModal(s.building_id, s.period)}
                                                disabled={s.paid_count > 0}
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                title="Eliminar grupo"
                                                onClick={() => handleDelete(s.building_id, s.period)}
                                                disabled={s.paid_count > 0}
                                                style={{ color: s.paid_count > 0 ? undefined : "var(--color-danger)" }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modify Modal */}
            {modifyModal && (
                <div style={{
                    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
                }}>
                    <div style={{
                        background: "var(--color-surface)", borderRadius: "0.75rem",
                        padding: "2rem", minWidth: "380px", maxWidth: "480px", width: "100%",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
                    }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                            Modificar Grupo de Cobros
                        </h2>
                        <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                            Período {modifyModal.period} — solo se pueden modificar cobros sin pagos registrados.
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div>
                                <label className="form-label">Nuevo monto base (CLP)</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    placeholder="Ej: 50000 (se multiplica por alícuota)"
                                    value={modifyForm.new_base_amount}
                                    onChange={e => setModifyForm(f => ({ ...f, new_base_amount: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="form-label">Nueva fecha de vencimiento</label>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={modifyForm.new_due_date}
                                    onChange={e => setModifyForm(f => ({ ...f, new_due_date: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="form-label">Nuevo concepto</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="Ej: Gasto Común Revisado"
                                    value={modifyForm.new_concept}
                                    onChange={e => setModifyForm(f => ({ ...f, new_concept: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={() => setModifyModal(null)} disabled={modifyLoading}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleModify}
                                disabled={modifyLoading || (!modifyForm.new_base_amount && !modifyForm.new_due_date && !modifyForm.new_concept)}
                            >
                                {modifyLoading ? "Guardando..." : "Guardar cambios"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
