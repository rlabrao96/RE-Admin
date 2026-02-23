import { StatCard } from "@/components/ui/StatCard";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
    title: "Dashboard — EdificioApp",
};

export default async function AdminDashboard() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Get admin's buildings count
    const { count: buildingsCount } = await supabase
        .from("buildings")
        .select("*", { count: "exact", head: true });

    // Get pending charges count
    const { count: pendingCharges } = await supabase
        .from("charges")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

    // Get pending payments count
    const { count: pendingPayments } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("reconciliation_status", "pending");

    // Get this month's collected amount
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: paidThisMonth } = await supabase
        .from("payments")
        .select("amount_clp")
        .eq("status", "completed")
        .gte("paid_at", `${currentMonth}-01`);

    const totalCollected =
        paidThisMonth?.reduce((sum, p) => sum + p.amount_clp, 0) ?? 0;

    function formatCLP(amount: number) {
        return `$${amount.toLocaleString("es-CL")}`;
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">
                        Bienvenido. Resumen de tu gestión este mes.
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="stats-grid">
                <StatCard
                    label="Edificios"
                    value={String(buildingsCount ?? 0)}
                    icon={<span style={{ fontSize: "1.125rem" }}>🏢</span>}
                />
                <StatCard
                    label="Cobros Pendientes"
                    value={String(pendingCharges ?? 0)}
                    trendPositive={false}
                    icon={<span style={{ fontSize: "1.125rem" }}>📋</span>}
                />
                <StatCard
                    label="Recaudado este Mes"
                    value={formatCLP(totalCollected)}
                    trend="este mes"
                    trendPositive={true}
                    icon={<span style={{ fontSize: "1.125rem" }}>💰</span>}
                />
                <StatCard
                    label="Por Conciliar"
                    value={String(pendingPayments ?? 0)}
                    trendPositive={false}
                    icon={<span style={{ fontSize: "1.125rem" }}>🔍</span>}
                />
            </div>

            {/* Quick Actions */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "1rem",
                }}
            >
                <div className="card">
                    <h2
                        style={{
                            fontSize: "1rem",
                            fontWeight: 600,
                            marginBottom: "0.75rem",
                        }}
                    >
                        Acciones Rápidas
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <a href="/admin/charges/generate" className="btn btn-primary">
                            <span>📋</span> Generar Cobros del Mes
                        </a>
                        <a href="/admin/notifications/new" className="btn btn-ghost" style={{ border: "1px solid var(--color-gray-200)" }}>
                            <span>🔔</span> Enviar Notificación
                        </a>
                        <a href="/admin/reconciliation" className="btn btn-ghost" style={{ border: "1px solid var(--color-gray-200)" }}>
                            <span>🔍</span> Conciliar Pagos
                        </a>
                    </div>
                </div>

                <div className="card">
                    <h2
                        style={{
                            fontSize: "1rem",
                            fontWeight: 600,
                            marginBottom: "0.75rem",
                        }}
                    >
                        Actividad Reciente
                    </h2>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                        Aquí aparecerán los últimos pagos y movimientos.
                    </p>
                </div>
            </div>
        </div>
    );
}
