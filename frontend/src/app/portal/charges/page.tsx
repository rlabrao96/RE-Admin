import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Mis Gastos Comunes — EdificioApp" };

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendiente", cls: "badge-warning" },
    paid: { label: "Pagado", cls: "badge-success" },
    overdue: { label: "Vencido", cls: "badge-danger" },
};

export default async function PortalChargesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: resident } = await supabase
        .from("residents")
        .select("id, unit_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

    const { data: charges } = resident
        ? await supabase
            .from("charges")
            .select("*")
            .eq("unit_id", resident.unit_id)
            .order("due_date", { ascending: false })
        : { data: [] };

    const pending = (charges ?? []).filter((c: { status: string }) => c.status === "pending");
    const paid = (charges ?? []).filter((c: { status: string }) => c.status === "paid");

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Mis Gastos Comunes</h1>
                    <p className="page-subtitle">
                        {pending.length > 0
                            ? `${pending.length} cobro${pending.length !== 1 ? "s" : ""} pendiente${pending.length !== 1 ? "s" : ""}`
                            : "Todo pagado ✅"
                        }
                    </p>
                </div>
            </div>

            {/* Pending */}
            {pending.length > 0 && (
                <div style={{ marginBottom: "2rem" }}>
                    <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-danger)" }}>
                        ⚠️ Pendiente de Pago
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {pending.map((c: { id: string; concept: string; period: string; amount_clp: number; due_date: string; status: string }) => (
                            <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{c.concept}</div>
                                    <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                        Período: {c.period} · Vence: {new Date(c.due_date).toLocaleDateString("es-CL")}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                                    <strong style={{ fontSize: "1.125rem" }}>{formatCLP(c.amount_clp)}</strong>
                                    <a
                                        href={`/portal/payments/pay?charge_id=${c.id}&amount=${c.amount_clp}`}
                                        className="btn btn-primary"
                                    >
                                        💳 Pagar
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* History */}
            <div>
                <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.75rem" }}>Historial</h2>
                {paid.length === 0 ? (
                    <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem" }}>Sin pagos anteriores.</p>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Concepto</th>
                                    <th>Período</th>
                                    <th>Monto</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paid.map((c: { id: string; concept: string; period: string; amount_clp: number; status: string }) => (
                                    <tr key={c.id}>
                                        <td>{c.concept}</td>
                                        <td>{c.period}</td>
                                        <td style={{ fontWeight: 600 }}>{formatCLP(c.amount_clp)}</td>
                                        <td><span className={`badge ${STATUS_INFO[c.status]?.cls ?? ""}`}>{STATUS_INFO[c.status]?.label ?? c.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
