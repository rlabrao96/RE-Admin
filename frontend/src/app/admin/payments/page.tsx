"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface Payment {
    id: string;
    amount_clp: number;
    payment_method: string;
    status: string;
    reconciliation_status: string;
    paid_at: string;
    charges?: {
        concept: string;
        period: string;
        units?: {
            number: string;
            floors?: {
                buildings?: { name: string };
            };
        };
    };
    residents?: { profiles?: { full_name: string } };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const METHOD_LABELS: Record<string, string> = {
    webpay: "Webpay Plus",
    bank_transfer: "Transferencia",
    transferencia: "Transferencia",
    efectivo: "Efectivo",
    cheque: "Cheque",
    manual: "Manual",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    completed: { label: "Completado", cls: "badge-success" },
    partial: { label: "Parcial", cls: "badge-warning" },
    pending: { label: "Pendiente", cls: "badge-warning" },
    failed: { label: "Fallido", cls: "badge-error" },
};

const RECONCILIATION_BADGE: Record<string, { label: string; cls: string }> = {
    matched: { label: "Conciliado", cls: "badge-success" },
    reconciled: { label: "Conciliado", cls: "badge-success" },
    pending: { label: "Pendiente", cls: "badge-warning" },
    unmatched: { label: "Sin conciliar", cls: "badge-warning" },
};

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("");
    const [filterBuilding, setFilterBuilding] = useState("");

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

    // Derive available buildings from data for the filter dropdown
    const availableBuildings = useMemo(() => {
        const names = new Set<string>();
        for (const p of payments) {
            const name = p.charges?.units?.floors?.buildings?.name;
            if (name) names.add(name);
        }
        return Array.from(names).sort();
    }, [payments]);

    const filtered = filterBuilding
        ? payments.filter(p => p.charges?.units?.floors?.buildings?.name === filterBuilding)
        : payments;

    const total = filtered.reduce((s, p) => s + p.amount_clp, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Historial de Pagos</h1>
                    <p className="page-subtitle">{filtered.length} pago{filtered.length !== 1 ? "s" : ""} · Total: {formatCLP(total)}</p>
                </div>
                <a href="/admin/reconciliation" className="btn btn-ghost" style={{ border: "1px solid var(--color-gray-200)" }}>
                    🔍 Conciliar Pendientes
                </a>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <select className="form-input" style={{ width: "auto" }} value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
                    <option value="">Todos los edificios</option>
                    {availableBuildings.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select className="form-input" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="completed">Completado</option>
                    <option value="pending">Pendiente</option>
                    <option value="failed">Fallido</option>
                </select>
                <input className="form-input" type="month" style={{ width: "auto" }} value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} />
                {(filterStatus || filterPeriod || filterBuilding) && (
                    <button className="btn btn-ghost" onClick={() => { setFilterStatus(""); setFilterPeriod(""); setFilterBuilding(""); }}>Limpiar</button>
                )}
            </div>

            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando...</p>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>💳</div>
                        <p style={{ color: "var(--color-gray-500)" }}>No hay pagos registrados.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Edificio</th>
                                <th>Unidad</th>
                                <th>Concepto</th>
                                <th>Período</th>
                                <th>Método</th>
                                <th>Monto</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const buildingName = p.charges?.units?.floors?.buildings?.name ?? "—";
                                const unitNumber = p.charges?.units?.number;
                                const statusInfo = STATUS_BADGE[p.status] ?? { label: p.status, cls: "badge-ghost" };
                                return (
                                    <tr key={p.id}>
                                        <td>{buildingName}</td>
                                        <td>{unitNumber ? `Unidad ${unitNumber}` : (p.residents?.profiles?.full_name ?? "—")}</td>
                                        <td>{p.charges?.concept ?? "—"}</td>
                                        <td>{p.charges?.period ?? "—"}</td>
                                        <td>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                                        <td style={{ fontWeight: 600 }}>{formatCLP(p.amount_clp)}</td>
                                        <td>{new Date(p.paid_at).toLocaleDateString("es-CL")}</td>
                                        <td>
                                            <span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
