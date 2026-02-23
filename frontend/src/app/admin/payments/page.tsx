"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Payment {
    id: string;
    amount_clp: number;
    payment_method: string;
    status: string;
    reconciliation_status: string;
    paid_at: string;
    charges?: { concept: string; period: string; units?: { number: string } };
    residents?: { profiles?: { full_name: string } };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const METHOD_LABELS: Record<string, string> = {
    webpay: "Webpay Plus",
    transferencia: "Transferencia",
    efectivo: "Efectivo",
    cheque: "Cheque",
};

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("");

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const params = new URLSearchParams();
        if (filterStatus) params.set("status", filterStatus);
        if (filterPeriod) params.set("period", filterPeriod);
        const res = await fetch(`${API_URL}/api/payments/?${params}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setPayments(await res.json());
        setLoading(false);
    }, [filterStatus, filterPeriod]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);

    const total = payments.reduce((s, p) => s + p.amount_clp, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Historial de Pagos</h1>
                    <p className="page-subtitle">{payments.length} pago{payments.length !== 1 ? "s" : ""} · Total: {formatCLP(total)}</p>
                </div>
                <a href="/admin/reconciliation" className="btn btn-ghost" style={{ border: "1px solid var(--color-gray-200)" }}>
                    🔍 Conciliar Pendientes
                </a>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                <select className="form-input" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="completed">Completado</option>
                    <option value="pending">Pendiente</option>
                    <option value="failed">Fallido</option>
                </select>
                <input className="form-input" type="month" style={{ width: "auto" }} value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} />
                {(filterStatus || filterPeriod) && (
                    <button className="btn btn-ghost" onClick={() => { setFilterStatus(""); setFilterPeriod(""); }}>Limpiar</button>
                )}
            </div>

            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando...</p>
                ) : payments.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>💳</div>
                        <p style={{ color: "var(--color-gray-500)" }}>No hay pagos registrados.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Residente</th>
                                <th>Concepto</th>
                                <th>Período</th>
                                <th>Método</th>
                                <th>Monto</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map(p => (
                                <tr key={p.id}>
                                    <td>{p.residents?.profiles?.full_name ?? "—"}</td>
                                    <td>{p.charges?.concept ?? "—"} {p.charges?.units?.number ? `(Unidad ${p.charges.units.number})` : ""}</td>
                                    <td>{p.charges?.period ?? "—"}</td>
                                    <td>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                                    <td style={{ fontWeight: 600 }}>{formatCLP(p.amount_clp)}</td>
                                    <td>{new Date(p.paid_at).toLocaleDateString("es-CL")}</td>
                                    <td>
                                        <span className={`badge ${p.reconciliation_status === "reconciled" ? "badge-success" : "badge-warning"}`}>
                                            {p.reconciliation_status === "reconciled" ? "Conciliado" : "Pendiente"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
