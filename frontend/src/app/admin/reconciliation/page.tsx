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
function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default function ReconciliationPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [reconciling, setReconciling] = useState<string | null>(null);

    const fetchPending = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${API_URL}/api/payments/pending-reconciliation`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setPayments(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { fetchPending(); }, [fetchPending]);

    async function handleReconcile(paymentId: string, externalRef: string) {
        setReconciling(paymentId);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await fetch(`${API_URL}/api/payments/reconcile`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ payment_id: paymentId, external_ref: externalRef || null }),
        });
        setReconciling(null);
        fetchPending();
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Conciliación de Pagos</h1>
                    <p className="page-subtitle">
                        {payments.length} pago{payments.length !== 1 ? "s" : ""} pendiente{payments.length !== 1 ? "s" : ""} de confirmar
                    </p>
                </div>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando...</p>
            ) : payments.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✅</div>
                    <h2 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Todo conciliado</h2>
                    <p style={{ color: "var(--color-gray-500)" }}>No hay pagos pendientes de verificar.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {payments.map((payment) => (
                        <ReconcileRow
                            key={payment.id}
                            payment={payment}
                            onReconcile={handleReconcile}
                            reconciling={reconciling === payment.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function ReconcileRow({ payment, onReconcile, reconciling }: {
    payment: Payment;
    onReconcile: (id: string, ref: string) => void;
    reconciling: boolean;
}) {
    const [externalRef, setExternalRef] = useState("");
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", cursor: "pointer" }}
                onClick={() => setExpanded(!expanded)}
            >
                <div>
                    <div style={{ fontWeight: 600 }}>
                        {payment.charges?.concept ?? "Pago"} — {payment.charges?.units?.number ?? ""}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                        {payment.residents?.profiles?.full_name ?? "Residente"} · {payment.payment_method} · {new Date(payment.paid_at).toLocaleDateString("es-CL")}
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>{formatCLP(payment.amount_clp)}</span>
                    <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
                </div>
            </div>

            {expanded && (
                <div style={{ borderTop: "1px solid var(--color-gray-100)", padding: "1rem 1.25rem", background: "var(--color-gray-50)" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label className="form-label">Referencia externa (opcional)</label>
                            <input
                                className="form-input"
                                value={externalRef}
                                onChange={e => setExternalRef(e.target.value)}
                                placeholder="Nº transferencia o comprobante Transbank"
                            />
                        </div>
                        <button
                            className="btn btn-primary"
                            disabled={reconciling}
                            onClick={() => onReconcile(payment.id, externalRef)}
                        >
                            {reconciling ? "Confirmando..." : "✅ Confirmar"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
