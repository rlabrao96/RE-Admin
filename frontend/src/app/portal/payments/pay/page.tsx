"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

type PayMethod = "fintoc" | "webpay" | "transferencia";

function PayForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const chargeId = searchParams.get("charge_id") ?? "";
    const chargeIdsStr = searchParams.get("charge_ids") ?? "";
    const chargeIds = chargeIdsStr ? chargeIdsStr.split(",") : [chargeId];
    const amount = parseInt(searchParams.get("amount") ?? "0", 10);
    const buildingId = searchParams.get("building_id") ?? "";

    const [method, setMethod] = useState<PayMethod>("fintoc");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handlePay() {
        setLoading(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No autenticado");

            if (method === "fintoc") {
                // Fintoc Payment Initiation — redirect to hosted checkout
                const res = await fetch(`${API_URL}/api/fintoc/checkout`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({
                        charge_ids: chargeIds,
                        amount,
                        building_id: buildingId,
                        success_url: `${window.location.origin}/portal/charges?pago=exitoso`,
                        cancel_url: `${window.location.origin}/portal/charges?pago=cancelado`,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || "Error al crear sesión de pago");
                window.location.href = data.redirect_url;
                return;
            }

            if (method === "transferencia") {
                const res = await fetch(`${API_URL}/api/payments/manual`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ charge_ids: chargeIds, amount_clp: amount, payment_method: "transferencia" }),
                });
                if (!res.ok) throw new Error("Error al registrar el pago");
                router.push("/portal/charges?pago=registrado");
                return;
            }

            // Webpay Plus
            const res = await fetch(`${API_URL}/api/payments/webpay/init`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ charge_ids: chargeIds, amount_clp: amount, return_url: `${window.location.origin}/portal/payments/webpay/confirm` }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al iniciar Webpay");
            window.location.href = `${data.url}?token_ws=${data.token}`;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    }

    const payMethods: { value: PayMethod; label: string; subtitle: string }[] = [
        { value: "fintoc", label: "🏦 Pagar con tu banco", subtitle: "Transferencia directa vía Fintoc" },
        { value: "webpay", label: "💳 Webpay Plus", subtitle: "Débito / Crédito" },
        { value: "transferencia", label: "📋 Transferencia manual", subtitle: "Registro pendiente de confirmación" },
    ];

    return (
        <div style={{ maxWidth: 480 }}>
            <div className="page-header">
                <div>
                    <a href="/portal/charges" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>Realizar Pago</h1>
                </div>
            </div>

            <div className="card">
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>Monto a pagar</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--color-primary)" }}>{formatCLP(amount)}</div>
                    {chargeIds.length > 1 && (
                        <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)", marginTop: "0.25rem" }}>
                            {chargeIds.length} cargos incluidos
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">Método de pago</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {payMethods.map(opt => (
                            <label
                                key={opt.value}
                                style={{
                                    display: "flex", flexDirection: "column", gap: "0.25rem",
                                    padding: "0.875rem",
                                    border: `2px solid ${method === opt.value ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                    borderRadius: "var(--radius-md)",
                                    cursor: "pointer",
                                    background: method === opt.value ? "var(--color-primary-light)" : "transparent",
                                }}
                            >
                                <input type="radio" name="method" value={opt.value} checked={method === opt.value} onChange={e => setMethod(e.target.value as PayMethod)} style={{ display: "none" }} />
                                <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{opt.label}</span>
                                <span style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)" }}>{opt.subtitle}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {method === "fintoc" && (
                    <div style={{ background: "var(--color-gray-50)", borderRadius: "var(--radius-md)", padding: "1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
                        <p style={{ color: "var(--color-gray-500)" }}>
                            Serás redirigido a Fintoc donde podrás seleccionar tu banco y autorizar el pago directamente desde tu cuenta. El pago se confirma automáticamente.
                        </p>
                    </div>
                )}

                {method === "transferencia" && (
                    <div style={{ background: "var(--color-gray-50)", borderRadius: "var(--radius-md)", padding: "1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
                        <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Datos para transferencia</p>
                        <p>Banco: BancoEstado</p>
                        <p>Cuenta: 00-123456-7</p>
                        <p>RUT: 76.543.210-5</p>
                        <p>Asunto: <strong>Depto + Período</strong></p>
                        <p style={{ marginTop: "0.5rem", color: "var(--color-gray-500)" }}>Tu pago quedará pendiente de confirmación por el administrador.</p>
                    </div>
                )}

                {error && <div className="login-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

                <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={handlePay}
                    disabled={loading}
                >
                    {loading
                        ? "Procesando..."
                        : method === "fintoc"
                            ? "Pagar con mi banco →"
                            : method === "webpay"
                                ? "Ir a Webpay →"
                                : "Confirmar Transferencia"
                    }
                </button>
            </div>
        </div>
    );
}

export default function PayPage() {
    return (
        <Suspense fallback={<div>Cargando...</div>}>
            <PayForm />
        </Suspense>
    );
}
