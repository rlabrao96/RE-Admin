"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Charge {
    id: string;
    unit_id: string;
    concept: string;
    period: string;
    amount_clp: number;
    due_date: string;
    status: "pending" | "paid" | "overdue";
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

export default function ChargesPage() {
    const [charges, setCharges] = useState<Charge[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("");

    const fetchCharges = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const params = new URLSearchParams();
        if (filterStatus) params.set("status", filterStatus);
        if (filterPeriod) params.set("period", filterPeriod);

        const res = await fetch(`${API_URL}/api/charges/?${params}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setCharges(await res.json());
        setLoading(false);
    }, [filterStatus, filterPeriod]);

    useEffect(() => { fetchCharges(); }, [fetchCharges]);

    // Summary stats
    const totalPending = charges.filter(c => c.status === "pending").reduce((s, c) => s + c.amount_clp, 0);
    const totalPaid = charges.filter(c => c.status === "paid").reduce((s, c) => s + c.amount_clp, 0);
    const totalOverdue = charges.filter(c => c.status === "overdue").reduce((s, c) => s + c.amount_clp, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Gastos Comunes</h1>
                    <p className="page-subtitle">Gestiona los cobros mensuales de todas las unidades</p>
                </div>
                <a href="/admin/charges/generate" className="btn btn-primary">
                    <span>📋</span> Generar Cobros del Mes
                </a>
            </div>

            {/* Summary */}
            <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
                <div className="stat-card">
                    <span className="stat-label">Pendiente de Cobro</span>
                    <span className="stat-value" style={{ fontSize: "1.5rem" }}>{formatCLP(totalPending)}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Recaudado</span>
                    <span className="stat-value" style={{ fontSize: "1.5rem", color: "var(--color-success)" }}>{formatCLP(totalPaid)}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Vencido</span>
                    <span className="stat-value" style={{ fontSize: "1.5rem", color: "var(--color-danger)" }}>{formatCLP(totalOverdue)}</span>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                <select className="form-input" style={{ width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="pending">Pendiente</option>
                    <option value="paid">Pagado</option>
                    <option value="overdue">Vencido</option>
                </select>
                <input
                    className="form-input"
                    type="month"
                    style={{ width: "auto" }}
                    value={filterPeriod}
                    onChange={e => setFilterPeriod(e.target.value)}
                    placeholder="Período"
                />
                {(filterStatus || filterPeriod) && (
                    <button className="btn btn-ghost" onClick={() => { setFilterStatus(""); setFilterPeriod(""); }}>
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando...</p>
                ) : charges.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📋</div>
                        <p style={{ color: "var(--color-gray-500)" }}>No hay cobros. Genera los cobros del mes.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th>Período</th>
                                <th>Monto</th>
                                <th>Vencimiento</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {charges.map((charge) => {
                                const statusInfo = STATUS_LABELS[charge.status] ?? { label: charge.status, className: "badge-primary" };
                                return (
                                    <tr key={charge.id}>
                                        <td>{charge.concept}</td>
                                        <td>{charge.period}</td>
                                        <td style={{ fontWeight: 600 }}>{formatCLP(charge.amount_clp)}</td>
                                        <td>{new Date(charge.due_date).toLocaleDateString("es-CL")}</td>
                                        <td>
                                            <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
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
