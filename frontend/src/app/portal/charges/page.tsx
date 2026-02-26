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

            {/* Pending Consolidation */}
            {pending.length > 0 && (() => {
                const now = new Date();
                const currentPeriod = now.toISOString().slice(0, 7);

                const summary = pending.reduce((acc: any, c: any) => {
                    const concept = (c.concept || "").toLowerCase();
                    const isCurrent = c.period === currentPeriod;

                    if (concept.includes("multa") || concept.includes("individual")) {
                        acc.multas += c.amount_clp;
                    } else if (concept.includes("interes") || concept.includes("interés")) {
                        acc.intereses += c.amount_clp;
                    } else if (isCurrent) {
                        acc.gastoComun += c.amount_clp;
                    } else {
                        acc.gastosPendientes += c.amount_clp;
                    }
                    acc.total += c.amount_clp;
                    acc.ids.push(c.id);
                    return acc;
                }, { gastoComun: 0, gastosPendientes: 0, multas: 0, intereses: 0, total: 0, ids: [] });

                return (
                    <div style={{ marginBottom: "2rem" }}>
                        <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.75rem", color: "var(--color-danger)" }}>
                            ⚠️ Saldo Pendiente de Pago
                        </h2>
                        <div className="card" style={{ padding: "1.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
                                <div>
                                    <div style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>Total a Pagar</div>
                                    <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-primary)" }}>{formatCLP(summary.total)}</div>
                                </div>
                                <a
                                    href={`/portal/payments/pay?charge_id=${summary.ids[0]}&charge_ids=${summary.ids.join(",")}&amount=${summary.total}`}
                                    className="btn btn-primary btn-lg"
                                >
                                    💳 Pagar Todo
                                </a>
                            </div>

                            <div style={{ borderTop: "1px solid var(--color-gray-100)", paddingTop: "1rem" }}>
                                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Desglose:</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    {summary.gastoComun > 0 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                                            <span>Gasto Común ({currentPeriod})</span>
                                            <span>{formatCLP(summary.gastoComun)}</span>
                                        </div>
                                    )}
                                    {summary.gastosPendientes > 0 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--color-gray-600)" }}>
                                            <span>Deuda Anterior</span>
                                            <span>{formatCLP(summary.gastosPendientes)}</span>
                                        </div>
                                    )}
                                    {summary.multas > 0 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--color-warning)" }}>
                                            <span>Multas Acumuladas</span>
                                            <span>{formatCLP(summary.multas)}</span>
                                        </div>
                                    )}
                                    {summary.intereses > 0 && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--color-danger)" }}>
                                            <span>Intereses por Mora</span>
                                            <span>{formatCLP(summary.intereses)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
