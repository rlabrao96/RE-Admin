import { createClient } from "@/lib/supabase/server";

export const metadata = {
    title: "Reportes Financieros — EdificioApp",
};

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default async function ReportsPage() {
    const supabase = await createClient();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const prevMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);

    // Charges this month vs last
    const [chargesThisMonth, chargesPrevMonth] = await Promise.all([
        supabase.from("charges").select("amount_clp, status").eq("period", currentMonth),
        supabase.from("charges").select("amount_clp, status").eq("period", prevMonth),
    ]);

    // Payments this month
    const { data: paymentsThisMonth } = await supabase
        .from("payments")
        .select("amount_clp, payment_method")
        .eq("status", "completed")
        .gte("paid_at", `${currentMonth}-01`);

    // Collection rate current month
    const totalCharged = chargesThisMonth.data?.reduce((s, c) => s + c.amount_clp, 0) ?? 0;
    const totalCollected = paymentsThisMonth?.reduce((s, p) => s + p.amount_clp, 0) ?? 0;
    const collectionRate = totalCharged > 0 ? ((totalCollected / totalCharged) * 100).toFixed(1) : "0";

    // Payment method breakdown
    const byMethod: Record<string, number> = {};
    for (const p of paymentsThisMonth ?? []) {
        byMethod[p.payment_method] = (byMethod[p.payment_method] ?? 0) + p.amount_clp;
    }

    const METHOD_LABELS: Record<string, string> = {
        webpay: "Webpay Plus",
        transferencia: "Transferencia",
        efectivo: "Efectivo",
        cheque: "Cheque",
    };

    const prevTotal = chargesPrevMonth.data?.reduce((s, c) => s + c.amount_clp, 0) ?? 0;
    const paidPrev = chargesPrevMonth.data?.filter(c => c.status === "paid").reduce((s, c) => s + c.amount_clp, 0) ?? 0;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Reportes Financieros</h1>
                    <p className="page-subtitle">Resumen de ingresos y cobros</p>
                </div>
            </div>

            {/* KPI row */}
            <div className="stats-grid" style={{ marginBottom: "2rem" }}>
                <div className="stat-card">
                    <span className="stat-label">Cobrado este Mes</span>
                    <span className="stat-value">{formatCLP(totalCharged)}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Recaudado este Mes</span>
                    <span className="stat-value" style={{ color: "var(--color-success)" }}>{formatCLP(totalCollected)}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Tasa de Cobro</span>
                    <span className="stat-value">{collectionRate}%</span>
                    <span className="stat-trend">{parseFloat(collectionRate) >= 80 ? "✅ Buena" : "⚠️ Baja"}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Recaudado Mes Anterior</span>
                    <span className="stat-value">{formatCLP(paidPrev)}</span>
                    <span className="stat-trend" style={{ color: "var(--color-gray-400)" }}>de {formatCLP(prevTotal)} cobrado</span>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {/* Charges status breakdown */}
                <div className="card">
                    <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "1rem" }}>
                        Estado de Cobros — {currentMonth}
                    </h2>
                    {["pending", "paid", "overdue"].map(status => {
                        const charges = chargesThisMonth.data?.filter(c => c.status === status) ?? [];
                        const total = charges.reduce((s, c) => s + c.amount_clp, 0);
                        const pct = totalCharged > 0 ? (total / totalCharged) * 100 : 0;
                        const colors: Record<string, string> = {
                            pending: "var(--color-warning)",
                            paid: "var(--color-success)",
                            overdue: "var(--color-danger)",
                        };
                        const labels: Record<string, string> = {
                            pending: "Pendiente", paid: "Pagado", overdue: "Vencido",
                        };
                        return (
                            <div key={status} style={{ marginBottom: "0.75rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                                    <span>{labels[status]} ({charges.length})</span>
                                    <span style={{ fontWeight: 600 }}>{formatCLP(total)}</span>
                                </div>
                                <div style={{ height: 8, background: "var(--color-gray-100)", borderRadius: 4, overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", background: colors[status], borderRadius: 4, transition: "width 0.5s" }} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Payment methods */}
                <div className="card">
                    <h2 style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "1rem" }}>
                        Métodos de Pago — {currentMonth}
                    </h2>
                    {Object.entries(byMethod).length === 0 ? (
                        <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem" }}>Sin pagos este mes.</p>
                    ) : (
                        Object.entries(byMethod).map(([method, amount]) => (
                            <div key={method} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                                <span>{METHOD_LABELS[method] ?? method}</span>
                                <strong>{formatCLP(amount)}</strong>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
