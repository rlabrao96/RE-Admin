"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getExpenses } from "@/lib/expenses-api";

interface Building { id: string; name: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }
const notched_purple = "#4f46e5";

export default function GenerateChargesPage() {
    const router = useRouter();
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [form, setForm] = useState({
        building_id: "",
        period: new Date().toISOString().slice(0, 7),     // YYYY-MM
        base_amount_clp: "",
        due_date: "",
        concept: "",
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ created: number; total_amount_clp: number; period: string; charges: any[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notifying, setNotifying] = useState(false);
    const [notified, setNotified] = useState<string[]>([]); // charge ids that were notified
    const [isCalculatedFromExpenses, setIsCalculatedFromExpenses] = useState(false);
    const [utmValue, setUtmValue] = useState<number | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        // Set sensible default due_date: last day of the selected month
        if (form.period) {
            const [y, m] = form.period.split("-").map(Number);
            const lastDay = new Date(y, m, 0).toISOString().slice(0, 10);
            setForm(f => ({ ...f, due_date: lastDay }));
        }
    }, [form.period]);

    useEffect(() => {
        async function load() {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`${API_URL}/api/buildings/`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) setBuildings(await res.json());
        }
        load();
    }, []);

    useEffect(() => {
        async function fetchAutoExpenses() {
            if (form.building_id && form.period) {
                try {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) return;

                    const data = await getExpenses(session.access_token, form.building_id, form.period);

                    if (data && data.length > 0) {
                        const total = data.reduce((sum: number, exp: any) => sum + (exp.amount_clp || 0), 0);
                        if (total > 0) {
                            setForm(f => ({ ...f, base_amount_clp: total.toString() }));
                            setIsCalculatedFromExpenses(true);
                        }
                    }
                } catch (e) {
                    console.error("Failed to auto-fetch expenses", e);
                }
            }
        }
        fetchAutoExpenses();
    }, [form.building_id, form.period]);

    useEffect(() => {
        async function fetchUtm() {
            try {
                const res = await fetch("https://mindicador.cl/api/utm");
                const data = await res.json();
                if (data.serie && data.serie.length > 0) {
                    setUtmValue(data.serie[0].valor);
                }
            } catch (e) {
                console.error("Failed to fetch UTM", e);
            }
        }
        fetchUtm();
    }, [form.period]);

    const handleBaseAmountChange = (val: string) => {
        const numeric = val.replace(/\D/g, "");
        setForm(f => ({ ...f, base_amount_clp: numeric }));
        setIsCalculatedFromExpenses(false);
    };

    const formatInputNumber = (val: string) => {
        const num = parseInt(val.replace(/\D/g, ""), 10);
        return isNaN(num) ? "" : num.toLocaleString("es-CL");
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResult(null);
        setNotified([]);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/api/charges/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
                body: JSON.stringify({
                    ...form,
                    base_amount_clp: parseInt(form.base_amount_clp.replace(/\D/g, ""), 10),
                    utm_clp_value: utmValue,
                    preview: true
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al generar cobros");
            setResult(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    }

    async function handleNotify() {
        if (!result) return;
        setNotifying(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const chargeIds = result.charges.map((c: any) => c.id);
            const res = await fetch(`${API_URL}/api/charges/notify-residents`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
                body: JSON.stringify(chargeIds),
            });
            if (res.ok) setNotified(chargeIds);
        } catch (err) {
            console.error(err);
        } finally {
            setNotifying(false);
        }
    }

    async function handleConfirm() {
        setIsConfirming(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/api/charges/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
                body: JSON.stringify({
                    ...form,
                    base_amount_clp: parseInt(form.base_amount_clp.replace(/\D/g, ""), 10),
                    utm_clp_value: utmValue,
                    preview: false
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al confirmar cobros");
            setResult(data);
            alert("¡Cobros generados con éxito!");
            // router.push("/admin/charges"); 
            // Stay here to allow notification if needed, or redirect
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setIsConfirming(false);
        }
    }

    if (result) {
        const isPreview = (result as any).is_preview;
        return (
            <div>
                <div className="page-header">
                    <div>
                        <button onClick={() => setResult(null)} className="btn btn-ghost" style={{ padding: 0, marginBottom: "0.5rem" }}>
                            ← Volver a Configuración
                        </button>
                        <h1 className="page-title">{isPreview ? "Previsualización de Cobros" : "Resumen de Cobros Generados"}</h1>
                        <p className="page-subtitle">Periodo: {result.period} | Total: {formatCLP(result.total_amount_clp)}</p>
                    </div>
                    {!isPreview && (
                        <div className="page-header-actions">
                            <button
                                className="btn btn-primary"
                                onClick={handleNotify}
                                disabled={notifying || notified.length > 0}
                            >
                                {notifying ? "Enviando Notificaciones..." : notified.length > 0 ? "Notificaciones Enviadas ✅" : "Notificar a los Residentes"}
                            </button>
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "2px solid var(--color-gray-200)", textAlign: "left" }}>
                                <th style={{ padding: "0.75rem" }}>Depto</th>
                                <th style={{ padding: "0.75rem" }}>Residente / Email</th>
                                <th style={{ padding: "0.75rem" }}>Alícuota (%)</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Gasto Común</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>G.C. Pendiente</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Multas</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Intereses</th>
                                <th style={{ padding: "0.75rem", textAlign: "right" }}>Total</th>
                                <th style={{ padding: "0.75rem", textAlign: "center" }}>Notificación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const groupedCharges = result.charges.reduce((acc: any, c: any) => {
                                    if (!acc[c.unit_id]) {
                                        acc[c.unit_id] = {
                                            unit: c.unit,
                                            unit_id: c.unit_id,
                                            gastoComun: 0,
                                            gcPendiente: 0,
                                            multa: 0,
                                            interes: 0,
                                            total: 0,
                                            chargeIds: [],
                                            accumulatedUtm: 0,
                                            hasNewFine: false
                                        };
                                    }
                                    const group = acc[c.unit_id];
                                    group.chargeIds.push(c.id);
                                    const concept = (c.concept || "").toLowerCase();
                                    const isCurrentPeriod = c.period === result.period;
                                    const isFine = concept.includes("multa") || concept.includes("individual");

                                    if (isFine) {
                                        group.multa += c.amount_clp;
                                        if (c.amount_utm) {
                                            group.accumulatedUtm += Number(c.amount_utm);
                                        }
                                        // A fine is "new" if it's in the current period and was created in this generation
                                        // Since result.charges contains both, we check if it's current period
                                        if (isCurrentPeriod) {
                                            group.hasNewFine = true;
                                        }
                                    } else if (concept.includes("interés") || concept.includes("interes")) {
                                        group.interes += c.amount_clp;
                                    } else if (isCurrentPeriod) {
                                        group.gastoComun += c.amount_clp;
                                    } else {
                                        group.gcPendiente += c.amount_clp;
                                    }
                                    group.total += c.amount_clp;
                                    return acc;
                                }, {});

                                const sortedGroups = Object.values(groupedCharges).sort((a: any, b: any) =>
                                    (a.unit?.number || "").localeCompare(b.unit?.number || "", undefined, { numeric: true })
                                );

                                return sortedGroups.map((g: any) => {
                                    const resident = g.unit?.resident?.[0];
                                    const hasEmail = !!resident?.user?.email;
                                    const isNotified = g.chargeIds.some((id: string) => notified.includes(id));

                                    return (
                                        <tr key={g.unit_id} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                                            <td style={{ fontWeight: 600, padding: "0.75rem", verticalAlign: "middle" }}>{g.unit?.number}</td>
                                            <td style={{ padding: "0.75rem", verticalAlign: "middle" }}>
                                                {resident ? (
                                                    <div style={{ minHeight: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                                        <div style={{ fontWeight: 500 }}>{resident.user?.full_name}</div>
                                                        <div style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>
                                                            {resident.user?.email || "Sin email"}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ minHeight: "2.5rem", display: "flex", alignItems: "center" }}>
                                                        <span style={{ color: "var(--color-gray-400)" }}>Sin residente</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: "0.75rem", verticalAlign: "middle" }}>{g.unit?.alicuota}%</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>{formatCLP(g.gastoComun)}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", color: "var(--color-gray-500)", verticalAlign: "middle" }}>{g.gcPendiente > 0 ? formatCLP(g.gcPendiente) : "-"}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
                                                    <span>{g.multa > 0 ? formatCLP(g.multa) : "-"}</span>
                                                    {isPreview && g.hasNewFine && (
                                                        <span
                                                            title="Nueva multa generada"
                                                            style={{
                                                                width: "8px",
                                                                height: "8px",
                                                                backgroundColor: "#ef4444",
                                                                borderRadius: "50%",
                                                                display: "inline-block"
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                {g.accumulatedUtm > 0 && (
                                                    <div style={{
                                                        fontSize: "0.75rem",
                                                        color: "var(--color-gray-500)",
                                                        fontWeight: 400,
                                                        textAlign: "right",
                                                        paddingRight: (isPreview && g.hasNewFine) ? "1.3rem" : "0"
                                                    }}>
                                                        {g.accumulatedUtm.toFixed(1)} UTM
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", verticalAlign: "middle" }}>{g.interes > 0 ? formatCLP(g.interes) : "-"}</td>
                                            <td style={{ textAlign: "right", padding: "0.75rem", fontWeight: 600, verticalAlign: "middle" }}>{formatCLP(g.total)}</td>
                                            <td style={{ textAlign: "center", padding: "0.75rem", verticalAlign: "middle" }}>
                                                {isNotified ? (
                                                    <span style={{ color: "var(--color-success)", fontSize: "0.875rem" }}>Enviado ✅</span>
                                                ) : hasEmail ? (
                                                    <span style={{ color: "var(--color-primary)", fontSize: "0.875rem" }}>Listo para enviar</span>
                                                ) : (
                                                    <span style={{ color: "var(--color-warning)", fontSize: "0.875rem" }}>Falta email</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                        <tfoot style={{ background: "var(--color-gray-50)", borderTop: "2px solid var(--color-gray-200)" }}>
                            <tr style={{ fontWeight: 700 }}>
                                <td colSpan={2} style={{ textAlign: "right", padding: "1rem 0.75rem" }}>TOTAL</td>
                                <td style={{ padding: "1rem 0.75rem" }}>
                                    {/* Need a distinct unit sum, not summing duplicates if a unit has > 1 charge */}
                                    {Array.from(new Set(result.charges.map((c: any) => c.unit_id))).reduce((sum: number, unitId: any) => {
                                        const unitCharge = result.charges.find((c: any) => c.unit_id === unitId);
                                        return sum + (unitCharge?.unit?.alicuota || 0);
                                    }, 0).toFixed(2)}%
                                </td>
                                <td style={{ textAlign: "right", padding: "1rem 0.75rem" }}>
                                    {formatCLP(result.charges.filter((c: any) => c.period === result.period && !((c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual") || (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés"))).reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", padding: "1rem 0.75rem", color: "var(--color-gray-500)" }}>
                                    {formatCLP(result.charges.filter((c: any) => c.period !== result.period && !((c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual") || (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés"))).reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", padding: "1rem 0.75rem" }}>
                                    {formatCLP(result.charges.filter((c: any) => (c.concept || "").toLowerCase().includes("multa") || (c.concept || "").toLowerCase().includes("individual")).reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", padding: "1rem 0.75rem" }}>
                                    {formatCLP(result.charges.filter((c: any) => (c.concept || "").toLowerCase().includes("interes") || (c.concept || "").toLowerCase().includes("interés")).reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td style={{ textAlign: "right", color: "var(--color-primary)", padding: "1rem 0.75rem" }}>
                                    {formatCLP(result.charges.reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style={{ marginTop: "2rem", textAlign: "center" }}>
                    {isPreview ? (
                        <button
                            className="btn btn-primary"
                            style={{
                                padding: "0.75rem 2rem",
                                fontSize: "1rem",
                                backgroundColor: notched_purple,
                                borderColor: notched_purple
                            }}
                            onClick={handleConfirm}
                            disabled={isConfirming}
                        >
                            {isConfirming ? "Generando..." : "Confirmar y Generar Cobros"}
                        </button>
                    ) : (
                        <a href="/admin/charges" className="btn btn-ghost">Finalizar y Ver Todos los Cobros</a>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <a href="/admin/charges" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver a Gastos Comunes
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>Generar Cobros del Mes</h1>
                    <p className="page-subtitle">Crea cobros individuales por unidad ponderados por alícuota</p>
                </div>
            </div>

            <div style={{ maxWidth: 560 }}>
                <div className="card">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Edificio</label>
                            <select className="form-input" value={form.building_id} onChange={e => setForm({ ...form, building_id: e.target.value })} required>
                                <option value="">Seleccionar edificio...</option>
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className="form-group">
                                <label className="form-label">Período</label>
                                <input className="form-input" type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Fecha de Vencimiento</label>
                                <input className="form-input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} required />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Monto Total del Mes (CLP)</label>
                            <input
                                className="form-input"
                                type="text"
                                value={formatInputNumber(form.base_amount_clp)}
                                onChange={e => handleBaseAmountChange(e.target.value)}
                                placeholder="1.500.000"
                                required
                            />
                            <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                Este monto se distribuye a cada unidad según su alícuota (%). Ejemplo: 1.500.000 × 3% = 45.000 para esa unidad.
                                {isCalculatedFromExpenses && <span style={{ background: "var(--color-success)", color: "white", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 600 }}>Calculado desde Gastos Integrados</span>}
                                {!isCalculatedFromExpenses && form.base_amount_clp !== "" && <span style={{ background: "var(--color-gray-200)", color: "var(--color-gray-700)", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 600 }}>Modificado manualmente</span>}
                                {utmValue && <span style={{ background: "var(--color-primary)", color: "white", padding: "2px 6px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 600 }}>UTM: {formatCLP(utmValue)}</span>}
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Concepto (opcional)</label>
                            <input className="form-input" value={form.concept} onChange={e => setForm({ ...form, concept: e.target.value })} placeholder="Gasto Común Enero 2026 (se auto-genera si se deja vacío)" />
                        </div>

                        {error && (
                            <div className="login-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%" }}>
                            {loading ? "Generando cobros..." : "Generar Cobros"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
