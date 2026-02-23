"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Building { id: string; name: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

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
            const chargeIds = result.charges.map(c => c.id);
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

    if (result) {
        return (
            <div>
                <div className="page-header">
                    <div>
                        <button onClick={() => setResult(null)} className="btn btn-ghost" style={{ padding: 0, marginBottom: "0.5rem" }}>
                            ← Volver a Configuración
                        </button>
                        <h1 className="page-title">Resumen de Cobros Generados</h1>
                        <p className="page-subtitle">Periodo: {result.period} | Total: {formatCLP(result.total_amount_clp)}</p>
                    </div>
                    <div className="page-header-actions">
                        <button
                            className="btn btn-primary"
                            onClick={handleNotify}
                            disabled={notifying || notified.length > 0}
                        >
                            {notifying ? "Enviando Notificaciones..." : notified.length > 0 ? "Notificaciones Enviadas ✅" : "Notificar a los Residentes"}
                        </button>
                    </div>
                </div>

                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Depto</th>
                                <th>Residente</th>
                                <th>Email</th>
                                <th>Alícuota (%)</th>
                                <th style={{ textAlign: "right" }}>Monto</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.charges.map((charge: any) => {
                                const resident = charge.unit?.resident?.[0];
                                const hasEmail = !!resident?.user?.email;
                                return (
                                    <tr key={charge.id}>
                                        <td style={{ fontWeight: 600 }}>{charge.unit?.number}</td>
                                        <td>{resident?.user?.full_name || <span style={{ color: "var(--color-gray-400)" }}>Sin residente</span>}</td>
                                        <td>{resident?.user?.email || "-"}</td>
                                        <td>{charge.unit?.alicuota}%</td>
                                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCLP(charge.amount_clp)}</td>
                                        <td>
                                            {notified.includes(charge.id) ? (
                                                <span style={{ color: "var(--color-success)", fontSize: "0.875rem" }}>Enviado ✅</span>
                                            ) : hasEmail ? (
                                                <span style={{ color: "var(--color-primary)", fontSize: "0.875rem" }}>Listo para enviar</span>
                                            ) : (
                                                <span style={{ color: "var(--color-warning)", fontSize: "0.875rem" }}>Sin email</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot style={{ background: "var(--color-gray-50)", borderTop: "2px solid var(--color-gray-200)" }}>
                            <tr style={{ fontWeight: 700 }}>
                                <td colSpan={3}>TOTAL</td>
                                <td>
                                    {result.charges.reduce((sum: number, c: any) => sum + (c.unit?.alicuota || 0), 0).toFixed(2)}%
                                </td>
                                <td style={{ textAlign: "right" }}>
                                    {formatCLP(result.charges.reduce((sum: number, c: any) => sum + c.amount_clp, 0))}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div style={{ marginTop: "2rem", textAlign: "center" }}>
                    <a href="/admin/charges" className="btn btn-ghost">Finalizar y Ver Todos los Cobros</a>
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
                                type="number"
                                min={1}
                                value={form.base_amount_clp}
                                onChange={e => setForm({ ...form, base_amount_clp: e.target.value })}
                                placeholder="1500000"
                                required
                            />
                            <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Este monto se distribuye a cada unidad según su alícuota (%). Ejemplo: 1.500.000 × 3% = 45.000 para esa unidad.
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
