import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Mi Portal — EdificioApp" };

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default async function PortalDashboard() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    // Get resident profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

    // Get resident record with unit info
    const { data: resident } = await supabase
        .from("residents")
        .select("id, is_owner, unit_id, units(number, alicuota, floors(number, building_id, buildings(name)))")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

    // Get pending charges for this resident's unit
    const { data: pendingCharges } = resident
        ? await supabase
            .from("charges")
            .select("id, concept, period, amount_clp, due_date, status")
            .eq("unit_id", resident.unit_id)
            .eq("status", "pending")
            .order("due_date")
        : { data: [] };

    // Get unread notifications
    const { count: unreadCount } = await supabase
        .from("notification_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("resident_id", resident?.id ?? "")
        .is("read_at", null);

    const totalPending = (pendingCharges ?? []).reduce((s: number, c: { amount_clp: number }) => s + c.amount_clp, 0);

    const unitsData = Array.isArray(resident?.units) ? resident?.units[0] : resident?.units;
    const unit = unitsData as unknown as {
        number: string;
        alicuota: number;
        floors: { number: number; buildings: { name: string } };
    } | null;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        Bienvenido{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
                    </h1>
                    <p className="page-subtitle">
                        {unit
                            ? `Unidad ${unit.number} · Piso ${unit.floors?.number} · ${unit.floors?.buildings?.name}`
                            : "Tu portal de residente"
                        }
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
                <div className="stat-card">
                    <span className="stat-label">Por Pagar</span>
                    <span className="stat-value" style={{ color: totalPending > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                        {formatCLP(totalPending)}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Cobros Pendientes</span>
                    <span className="stat-value">{(pendingCharges ?? []).length}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Notificaciones</span>
                    <span className="stat-value">{unreadCount ?? 0}</span>
                    <span className="stat-trend">sin leer</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Alícuota</span>
                    <span className="stat-value">{unit?.alicuota ?? "—"}%</span>
                </div>
            </div>

            {/* Pending charges quick view */}
            {(pendingCharges ?? []).length > 0 && (
                <div className="card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                        <h2 style={{ fontWeight: 600, fontSize: "1rem" }}>Cobros Pendientes</h2>
                        <a href="/portal/charges" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                            Ver todos →
                        </a>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {(pendingCharges ?? []).slice(0, 3).map((c: { id: string; concept: string; period: string; amount_clp: number; due_date: string }) => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid var(--color-gray-100)" }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>{c.concept}</div>
                                    <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)" }}>
                                        Vence: {new Date(c.due_date).toLocaleDateString("es-CL")}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                                    <strong>{formatCLP(c.amount_clp)}</strong>
                                    <a href={`/portal/charges`} className="btn btn-primary" style={{ padding: "0.375rem 0.875rem", fontSize: "0.8125rem" }}>
                                        Pagar
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(pendingCharges ?? []).length === 0 && (
                <div className="card" style={{ textAlign: "center", padding: "2.5rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
                    <h2 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>¡Al día con tus pagos!</h2>
                    <p style={{ color: "var(--color-gray-500)" }}>No tienes cobros pendientes por el momento.</p>
                </div>
            )}
        </div>
    );
}
