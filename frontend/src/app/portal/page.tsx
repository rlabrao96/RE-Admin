"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default function PortalDashboard() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [resident, setResident] = useState<any>(null);
    const [pendingCharges, setPendingCharges] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [recentDeliveries, setRecentDeliveries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push("/auth/login");
            return;
        }

        const user = session.user;

        // 1. Get profile
        const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
        setProfile(profileData);

        // 2. Get resident + unit
        const { data: residentData } = await supabase
            .from("residents")
            .select("id, is_owner, unit_id, units(number, alicuota, floors(number, building_id, buildings(name)))")
            .eq("user_id", user.id)
            .eq("status", "active")
            .maybeSingle();
        setResident(residentData);

        if (residentData) {
            // 3. Get pending charges
            const { data: charges } = await supabase
                .from("charges")
                .select("id, concept, period, amount_clp, due_date, status")
                .eq("unit_id", residentData.unit_id)
                .eq("status", "pending")
                .order("due_date");
            setPendingCharges(charges || []);

            // 4. Get unread count
            const { count } = await supabase
                .from("notification_deliveries")
                .select("*", { count: "exact", head: true })
                .eq("resident_id", residentData.id)
                .is("read_at", null);
            setUnreadCount(count || 0);

            // 5. Get recent notifications
            const { data: deliveries } = await supabase
                .from("notification_deliveries")
                .select("notifications!inner(id, title, category, created_at)")
                .eq("resident_id", residentData.id)
                .order("read_at", { ascending: true })
                .limit(3);
            setRecentDeliveries(deliveries || []);
        }
        setLoading(false);
    }, [router]);

    useEffect(() => {
        fetchData();

        // Refresh when user returns to this tab
        window.addEventListener("focus", fetchData);
        return () => window.removeEventListener("focus", fetchData);
    }, [fetchData]);

    const totalPending = pendingCharges.reduce((s, c) => s + c.amount_clp, 0);

    const getFirst = (o: any) => Array.isArray(o) ? o[0] : o;
    const rawUnit = getFirst(resident?.units);
    const rawFloor = rawUnit ? getFirst(rawUnit.floors) : null;
    const rawBuilding = rawFloor ? getFirst(rawFloor.buildings) : null;

    const unit = rawUnit ? {
        number: rawUnit.number,
        alicuota: rawUnit.alicuota,
        floorNumber: rawFloor?.number,
        buildingName: rawBuilding?.name
    } : null;

    if (loading) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando portal...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        Bienvenido{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
                    </h1>
                    <p className="page-subtitle">
                        {unit
                            ? `Unidad ${unit.number} · Piso ${unit.floorNumber} · ${unit.buildingName}`
                            : "Tu portal de residente"
                        }
                    </p>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
                {/* 1. Saldo Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "200px", padding: "1.5rem" }}>
                    <div>
                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", fontWeight: 500 }}>Saldo Pendiente</span>
                        <div style={{ fontSize: "2.5rem", fontWeight: 700, color: totalPending > 0 ? "var(--color-danger)" : "var(--color-success)", margin: "0.5rem 0" }}>
                            {formatCLP(totalPending)}
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                            {pendingCharges.length} cobros pendientes
                        </div>
                    </div>
                    {totalPending > 0 && (
                        <a
                            href={`/portal/payments/pay?charge_ids=${pendingCharges.map(c => c.id).join(",")}&amount=${totalPending}`}
                            className="btn btn-primary"
                            style={{ width: "100%", marginTop: "1.5rem", textAlign: "center", display: "block" }}
                        >
                            💳 Pagar Todo
                        </a>
                    )}
                </div>

                {/* 2. Notifications Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "200px", padding: "1.5rem" }}>
                    <div>
                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", fontWeight: 500 }}>Comunicados</span>
                        <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--color-primary)", margin: "0.5rem 0" }}>
                            {unreadCount}
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "1rem" }}>
                            notificaciones sin leer
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {recentDeliveries.slice(0, 3).map((d: any) => {
                                const n = Array.isArray(d.notifications) ? d.notifications[0] : d.notifications;
                                if (!n) return null;
                                return (
                                    <div key={n.id} style={{ fontSize: "0.8125rem", color: "var(--color-gray-600)", borderBottom: "1px solid var(--color-gray-50)", paddingBottom: "0.25rem" }}>
                                        <div style={{ fontWeight: 600, color: "var(--color-gray-800)" }}>{n.title}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>
                                            {new Date(n.created_at).toLocaleDateString("es-CL")}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <a href="/portal/notifications" className="btn btn-primary" style={{ width: "100%", marginTop: "1.5rem", textAlign: "center", display: "block" }}>
                        📯 Ver comunicados
                    </a>
                </div>

                {/* 3. Documents Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "200px", padding: "1.5rem" }}>
                    <div>
                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", fontWeight: 500 }}>Documentos</span>
                        <div style={{ fontSize: "2rem", fontWeight: 600, color: "var(--color-gray-700)", margin: "0.75rem 0" }}>
                            Reglamento, Leyes...
                        </div>
                        <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", lineHeight: "1.4" }}>
                            Accede a los documentos oficiales de tu comunidad y reglamentos vigentes.
                        </p>
                    </div>
                    <a href="/portal/documents" className="btn btn-primary" style={{ width: "100%", marginTop: "1.5rem", textAlign: "center", display: "block" }}>
                        📄 Ver Documentos
                    </a>
                </div>

                {/* 4. Bookings Card (Moved to 4th or kept as 3rd) */}
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "200px", padding: "1.5rem" }}>
                    <div>
                        <span style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", fontWeight: 500 }}>Espacios Comunes</span>
                        <div style={{ fontSize: "2rem", fontWeight: 600, color: "var(--color-gray-700)", margin: "0.75rem 0" }}>
                            Quincho, Piscina...
                        </div>
                        <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", lineHeight: "1.4" }}>
                            Consulta disponibilidad y reserva los espacios comunes de tu edificio.
                        </p>
                    </div>
                    <button className="btn btn-outline" style={{ width: "100%", marginTop: "1.5rem" }} disabled>
                        📅 Reservar Espacios (Próximamente)
                    </button>
                </div>
            </div>

            {/* Quick Links / Aliquot */}
            <div className="card" style={{ background: "var(--color-gray-50)", border: "1px dashed var(--color-gray-300)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--color-gray-600)" }}>Tu Alícuota de Copropiedad:</span>
                    <span style={{ fontWeight: 600, color: "var(--color-gray-800)" }}>{unit?.alicuota ?? "—"}%</span>
                </div>
            </div>
        </div>
    );
}
