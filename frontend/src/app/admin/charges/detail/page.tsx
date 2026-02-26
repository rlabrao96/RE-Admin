"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Charge {
    id: string;
    unit_id: string;
    concept: string;
    period: string;
    amount_clp: number;
    due_date: string;
    status: "pending" | "paid" | "overdue";
    paid_at?: string;
    amount_utm?: number;
    units: {
        number: string;
        residents: Array<{
            is_owner: boolean;
            profiles: {
                full_name: string;
                email: string;
            }
        }>;
    }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatCLP(amount: number) {
    return `$${amount.toLocaleString("es-CL")}`;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendiente", className: "badge-warning" },
    paid: { label: "Pagado", className: "badge-success" },
    overdue: { label: "Vencido", className: "badge-danger" },
};

function ChargesDetailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const buildingId = searchParams.get("building_id");
    const period = searchParams.get("period");

    const [charges, setCharges] = useState<Charge[]>([]);
    const [loading, setLoading] = useState(true);
    const [buildingName, setBuildingName] = useState("");

    // Modal state
    const [showFineModal, setShowFineModal] = useState(false);
    const [utmValue, setUtmValue] = useState<number | null>(null);
    const [buildingUnits, setBuildingUnits] = useState<any[]>([]);
    const [fineForm, setFineForm] = useState({
        unit_id: "",
        concept: "Multa - Reglas de Copropiedad",
        utm_amount: 1,
        amount_clp_override: "",
        due_date: "",
        use_utm: true
    });
    const [creatingFine, setCreatingFine] = useState(false);
    const [isArchived, setIsArchived] = useState(false);

    const fetchData = useCallback(async () => {
        if (!buildingId || !period) return;
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Fetch all summaries for this building to find the latest period
        const resSum = await fetch(`${API_URL}/api/charges/summary`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resSum.ok) {
            const summaryData = await resSum.json();
            const bSummaries = summaryData.filter((s: any) => String(s.building_id) === String(buildingId));
            if (bSummaries.length > 0) {
                const latest = bSummaries.reduce((max: string, s: any) => s.period > max ? s.period : max, "");
                setIsArchived(period < latest);
            }
        }

        // Fetch current period charges
        const resCurr = await fetch(`${API_URL}/api/charges/?building_id=${buildingId}&period=${period}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        // Fetch ALL past charges for this building to accurately reconstruct past debt
        const resPast = await fetch(`${API_URL}/api/charges/?building_id=${buildingId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (resCurr.ok) {
            const dataCurr = await resCurr.json();
            let finalCharges = [...dataCurr];

            if (resPast.ok) {
                const dataPast = await resPast.json();

                // Helper: A past charge counts as debt for the CURRENT viewed period if it 
                // was unpaid at the time this period started.
                const isPendingForPeriod = (c: any, targetPeriod: string) => {
                    if (c.period >= targetPeriod) return false;
                    if (c.status === "pending") return true;
                    if (c.status === "paid" && c.paid_at) {
                        const paidMonth = c.paid_at.substring(0, 7); // Extracts "YYYY-MM"
                        // If it was paid in the target period or later, it was still pending when target period began
                        return paidMonth >= targetPeriod;
                    }
                    return false;
                };

                const existingIds = new Set(dataCurr.map((c: any) => c.id));
                const activePastCharges = dataPast.filter((c: any) =>
                    !existingIds.has(c.id) && isPendingForPeriod(c, period)
                );
                finalCharges = [...finalCharges, ...activePastCharges];
            }

            setCharges(finalCharges);
        }

        // Fetch building name separately
        const bRes = await fetch(`${API_URL}/api/buildings/${buildingId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (bRes.ok) {
            const bData = await bRes.json();
            setBuildingName(bData.name);
        }

        setLoading(false);
    }, [buildingId, period]);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleTogglePaid(chargeIds: string[], currentStatus: string) {
        setLoading(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const newStatus = currentStatus === "paid" ? "pending" : "paid";

            // Update each charge in parallel
            await Promise.all(
                chargeIds.map(id =>
                    fetch(`${API_URL}/api/charges/${id}?status=${newStatus}&context_period=${period}`, {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${session.access_token}` },
                    })
                )
            );

            await fetchData();
        } catch (err) {
            console.error("Error toggling payment status:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleOpenFineModal() {
        setShowFineModal(true);
        // Set default due_date to end of month for the given period
        if (period) {
            const [year, month] = period.split("-");
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            setFineForm(prev => ({ ...prev, due_date: `${period}-${lastDay}` }));
        }

        try {
            const res = await fetch("https://mindicador.cl/api/utm");
            const data = await res.json();
            setUtmValue(data.serie[0].valor);
        } catch (e) {
            console.error("Failed to fetch UTM", e);
        }

        if (buildingUnits.length === 0) {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (session && buildingId) {
                const res = await fetch(`${API_URL}/api/buildings/${buildingId}/units`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const floors = await res.json();
                    const allUnits = floors.flatMap((f: any) => f.units);
                    setBuildingUnits(allUnits);
                    if (allUnits.length > 0) {
                        setFineForm(prev => ({ ...prev, unit_id: allUnits[0].id }));
                    }
                }
            }
        }
    };

    const handleCreateFine = async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        setCreatingFine(true);

        const finalAmountClp = fineForm.use_utm
            ? Math.round(fineForm.utm_amount * (utmValue || 0))
            : parseInt(fineForm.amount_clp_override || "0");

        const res = await fetch(`${API_URL}/api/charges/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                unit_id: fineForm.unit_id,
                concept: fineForm.concept,
                period: period,
                amount_clp: finalAmountClp,
                due_date: fineForm.due_date,
                amount_utm: fineForm.use_utm ? fineForm.utm_amount : null
            })
        });

        setCreatingFine(false);
        if (res.ok) {
            setShowFineModal(false);
            fetchData();
        } else {
            alert("Error al crear la multa");
        }
    };

    if (!buildingId || !period) return <p>Faltan parámetros de búsqueda.</p>;

    return (
        <div>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <button className="btn btn-ghost" onClick={() => router.push("/admin/charges")} style={{ marginBottom: "0.5rem", padding: "0" }}>
                        ← Volver al resumen
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <h1 className="page-title" style={{ marginBottom: 0 }}>Detalle de Cobros</h1>
                        {isArchived && (
                            <span className="badge" style={{ background: "var(--color-gray-200)", color: "var(--color-gray-700)", fontSize: "0.7rem" }}>
                                ARCHIVO / SOLO LECTURA
                            </span>
                        )}
                    </div>
                    <p className="page-subtitle">
                        {buildingName || "Cargando..."} — Período {period}
                    </p>
                </div>
                <div>
                    <button className="btn btn-primary" onClick={handleOpenFineModal} disabled={isArchived}>
                        ➕ Aplicar Multa / Cobro Individual
                    </button>
                </div>
            </div>

            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando detalles...</p>
                ) : charges.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <p style={{ color: "var(--color-gray-500)" }}>No se encontraron cobros para este período.</p>
                    </div>
                ) : (
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid var(--color-gray-200)", textAlign: "left" }}>
                                <th style={{ padding: "0.75rem" }}>Unidad</th>
                                <th style={{ padding: "0.75rem" }}>Residente</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Gasto Común</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>G.C. Pendiente</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Multas</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Intereses</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Total</th>
                                <th style={{ padding: "0.75rem", textAlign: "center" }}>Estado</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const groupedCharges = charges.reduce((acc, c) => {
                                    if (!acc[c.unit_id]) {
                                        acc[c.unit_id] = {
                                            unit: c.units,
                                            unit_id: c.unit_id,
                                            gastoComun: 0,
                                            gcPendiente: 0,
                                            multa: 0,
                                            interes: 0,
                                            total: 0,
                                            status: 'paid', // Default to paid, will be downgraded if any current charge is pending
                                            currentChargeIds: [],
                                            allChargeIds: [],
                                            accumulatedUtm: 0,
                                            hasNewFine: false,
                                            hasCurrentCharges: false
                                        };
                                    }
                                    const group = acc[c.unit_id];
                                    const concept = (c.concept || "").toLowerCase();
                                    const isCurrent = c.period === period;
                                    const isFine = concept.includes("multa") || concept.includes("individual");

                                    group.allChargeIds.push(c.id);

                                    // Determine if this specific charge was pending at the END of THIS period
                                    // If it was paid strictly AFTER the viewed period, it was still pending back then.
                                    const isChargePendingForThisPeriod = c.status === "pending" || (c.status === "paid" && !!c.paid_at && c.paid_at.substring(0, 7) > period);

                                    if (isCurrent) {
                                        group.hasCurrentCharges = true;
                                        group.currentChargeIds.push(c.id);
                                        // If the current charge is functionally pending for this period, row is pending
                                        if (c.status === 'overdue') group.status = 'overdue';
                                        else if (isChargePendingForThisPeriod && group.status === 'paid') group.status = 'pending';
                                    } else {
                                        // If it's a past charge, and we're in an archived view, we must also 
                                        // downgrade the row to 'pending' if the past charge was pending during this period
                                        // Note: If missing current charges (e.g. they only have past debt), we still need to show them as pending
                                        if (isChargePendingForThisPeriod && group.status === 'paid') group.status = 'pending';
                                    }

                                    if (isFine) {
                                        group.multa += c.amount_clp;
                                        if (c.amount_utm) {
                                            group.accumulatedUtm += Number(c.amount_utm);
                                        }
                                        if (isCurrent) {
                                            group.hasNewFine = true;
                                        }
                                    } else if (concept.includes("interés") || concept.includes("interes")) {
                                        group.interes += c.amount_clp;
                                    } else if (isCurrent) {
                                        group.gastoComun += c.amount_clp;
                                    } else {
                                        group.gcPendiente += c.amount_clp;
                                    }

                                    group.total += c.amount_clp;
                                    return acc;
                                }, {} as Record<string, any>);

                                const sortedGroups = Object.values(groupedCharges).sort((a: any, b: any) =>
                                    (a.unit?.number || "").localeCompare(b.unit?.number || "", undefined, { numeric: true })
                                );

                                return sortedGroups.map((g: any) => {
                                    const statusInfo = STATUS_LABELS[g.status] ?? { label: g.status, className: "badge-primary" };
                                    const resident = g.unit?.residents?.[0];
                                    return (
                                        <tr key={g.unit_id} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                                            <td style={{ fontWeight: 600, padding: "0.75rem", verticalAlign: "middle" }}>Unidad {g.unit?.number}</td>
                                            <td style={{ padding: "0.75rem", verticalAlign: "middle" }}>
                                                {resident ? (
                                                    <div style={{ minHeight: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                                        <div style={{ fontWeight: 500 }}>{resident.profiles?.full_name}</div>
                                                        <div style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>
                                                            {resident.is_owner ? "Propietario" : "Arrendatario"} {resident.profiles?.email ? `• ${resident.profiles.email}` : ''}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ minHeight: "2.5rem", display: "flex", alignItems: "center" }}>
                                                        <span style={{ color: "var(--color-gray-400)" }}>Sin info</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>{formatCLP(g.gastoComun)}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", color: "var(--color-gray-500)", verticalAlign: "middle" }}>{g.gcPendiente > 0 ? formatCLP(g.gcPendiente) : "-"}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>
                                                <div style={{ textAlign: "right" }}>
                                                    {g.multa > 0 ? formatCLP(g.multa) : "-"}
                                                </div>
                                                {g.accumulatedUtm > 0 && (
                                                    <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", fontWeight: 400, textAlign: "right" }}>
                                                        {g.accumulatedUtm.toFixed(1)} UTM
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>{g.interes > 0 ? formatCLP(g.interes) : "-"}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", fontWeight: 600, verticalAlign: "middle" }}>{formatCLP(g.total)}</td>
                                            <td style={{ textAlign: "center", padding: "0.75rem", verticalAlign: "middle" }}>
                                                <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                                            </td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>
                                                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.8rem" }}>
                                                    {isArchived ? (
                                                        <span className="badge" style={{ background: "var(--color-gray-100)", color: "var(--color-gray-600)", border: "1px solid var(--color-gray-200)" }}>
                                                            {g.status === 'paid' ? "Saldado" : "Pendiente"}
                                                        </span>
                                                    ) : (
                                                        <label className={`switch ${!g.hasCurrentCharges ? 'disabled' : ''}`} title={!g.hasCurrentCharges ? "No hay cobros en este período" : (g.status === 'paid' ? "Marcar como pendiente" : "Marcar como pagado (incluye deuda anterior)")}>
                                                            <input
                                                                type="checkbox"
                                                                checked={g.status === 'paid'}
                                                                disabled={!g.hasCurrentCharges}
                                                                onChange={() => g.hasCurrentCharges && handleTogglePaid(g.allChargeIds, g.status)}
                                                            />
                                                            <span className="slider"></span>
                                                        </label>
                                                    )}
                                                    <button className="btn btn-sm btn-ghost" onClick={() => alert("Próximamente: Notificar/Cobrar")} disabled={isArchived}>
                                                        🔔
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: "var(--color-gray-100)", borderTop: "2px solid var(--color-gray-200)" }}>
                                <td colSpan={2} style={{ textAlign: "right", fontWeight: 700, padding: "1rem 0.75rem" }}>Total a recaudar:</td>
                                <td style={{ textAlign: "right", fontWeight: 600, padding: "1rem 0.75rem" }}>
                                    {formatCLP(charges.filter(c => c.period === period && !((c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual") || (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés"))).reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 600, padding: "1rem 0.75rem", color: "var(--color-gray-500)" }}>
                                    {formatCLP(charges.filter(c => c.period !== period && !((c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual") || (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés"))).reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 600, padding: "1rem 0.75rem" }}>
                                    {formatCLP(charges.filter(c => (c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual")).reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 600, padding: "1rem 0.75rem" }}>
                                    {formatCLP(charges.filter(c => (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés")).reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-primary)", padding: "1rem 0.75rem" }}>
                                    {formatCLP(charges.reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* Fines Creation Modal */}
            {showFineModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div className="card" style={{ width: "90%", maxWidth: "500px", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", maxHeight: "90vh", overflowY: "auto" }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Aplicar Multa o Cobro Individual</h2>
                        <p style={{ color: "var(--color-gray-500)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                            Este cobro se agregará al período actual ({period}).
                        </p>

                        <div className="form-group">
                            <label className="form-label">Unidad</label>
                            <select
                                className="form-input"
                                value={fineForm.unit_id}
                                onChange={e => setFineForm({ ...fineForm, unit_id: e.target.value })}
                            >
                                {buildingUnits.map(u => (
                                    <option key={u.id} value={u.id}>Unidad {u.number}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Concepto (Motivo)</label>
                            <input
                                className="form-input"
                                type="text"
                                value={fineForm.concept}
                                onChange={e => setFineForm({ ...fineForm, concept: e.target.value })}
                            />
                        </div>

                        <div className="form-group" style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                                <input
                                    type="radio"
                                    checked={fineForm.use_utm}
                                    onChange={() => setFineForm({ ...fineForm, use_utm: true })}
                                />
                                Usar Valor UTM
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                                <input
                                    type="radio"
                                    checked={!fineForm.use_utm}
                                    onChange={() => setFineForm({ ...fineForm, use_utm: false })}
                                />
                                Monto Fijo CLP
                            </label>
                        </div>

                        {fineForm.use_utm ? (
                            <div className="form-group" style={{ background: "var(--color-gray-50)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>Cantidad de UTM</label>
                                    <span style={{ fontSize: "0.8125rem", color: "var(--color-primary)", fontWeight: 500 }}>
                                        {utmValue ? `1 UTM = ${formatCLP(utmValue)}` : "Obteniendo valor UTM..."}
                                    </span>
                                </div>
                                <input
                                    className="form-input"
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={fineForm.utm_amount}
                                    onChange={e => setFineForm({ ...fineForm, utm_amount: parseFloat(e.target.value) || 0 })}
                                />
                                <div style={{ marginTop: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>
                                    Total a cobrar: {formatCLP(Math.round(fineForm.utm_amount * (utmValue || 0)))}
                                </div>
                                <div style={{ marginTop: "0.5rem", textAlign: "right", fontSize: "0.75rem" }}>
                                    <a href="https://www.sii.cl/valores_y_fechas/utm/utm2026.htm" target="_blank" rel="noreferrer" style={{ color: "var(--color-gray-500)", textDecoration: "underline" }}>
                                        Verificar en SII
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Monto (CLP)</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min="1"
                                    value={fineForm.amount_clp_override}
                                    onChange={e => setFineForm({ ...fineForm, amount_clp_override: e.target.value })}
                                    placeholder="Ej: 50000"
                                />
                            </div>
                        )}

                        <div className="form-group" style={{ marginTop: "1rem" }}>
                            <label className="form-label">Fecha de Vencimiento</label>
                            <input
                                className="form-input"
                                type="date"
                                value={fineForm.due_date}
                                onChange={e => setFineForm({ ...fineForm, due_date: e.target.value })}
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "2rem" }}>
                            <button className="btn btn-ghost" onClick={() => setShowFineModal(false)} disabled={creatingFine}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleCreateFine} disabled={creatingFine || !fineForm.unit_id}>
                                {creatingFine ? "Creado..." : "Aplicar Cobro"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ChargesDetailPage() {
    return (
        <Suspense fallback={<p>Cargando...</p>}>
            <ChargesDetailContent />
        </Suspense>
    );
}
