"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Charge {
    id: string;
    unit_id: string;
    concept: string;
    period: string;
    amount_clp: number;
    due_date: string;
    status: "pending" | "paid" | "overdue";
    units: {
        number: string;
        residents: Array<{
            is_owner: boolean;
            profiles: {
                full_name: string;
                email: string;
            }
        }>;
    }
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

function ChargesDetailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const buildingId = searchParams.get("building_id");
    const period = searchParams.get("period");

    const [charges, setCharges] = useState<Charge[]>([]);
    const [loading, setLoading] = useState(true);
    const [buildingName, setBuildingName] = useState("");

    const fetchData = useCallback(async () => {
        if (!buildingId || !period) return;
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/charges/?building_id=${buildingId}&period=${period}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
            const data = await res.json();
            setCharges(data);
        }

        // Fetch building name separately to ensure it displays even with 0 charges
        const bRes = await fetch(`${API_URL}/api/buildings/${buildingId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (bRes.ok) {
            const bData = await bRes.json();
            setBuildingName(bData.name);
        }

        setLoading(false);
    }, [buildingId, period]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (!buildingId || !period) return <p>Faltan parámetros de búsqueda.</p>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <button className="btn btn-ghost" onClick={() => router.push("/admin/charges")} style={{ marginBottom: "0.5rem", padding: "0" }}>
                        ← Volver al resumen
                    </button>
                    <h1 className="page-title">Detalle de Cobros</h1>
                    <p className="page-subtitle">
                        {buildingName || "Cargando..."} — Período {period}
                    </p>
                </div>
            </div>

            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando detalles...</p>
                ) : charges.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <p style={{ color: "var(--color-gray-500)" }}>No se encontraron cobros para este período.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Unidad</th>
                                <th>Residente / Propietario</th>
                                <th>Monto</th>
                                <th>Vencimiento</th>
                                <th>Estado</th>
                                <th style={{ textAlign: "right" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {charges.map((c) => {
                                const statusInfo = STATUS_LABELS[c.status] ?? { label: c.status, className: "badge-primary" };
                                const resident = c.units?.residents?.[0];
                                return (
                                    <tr key={c.id}>
                                        <td style={{ fontWeight: 600 }}>Unidad {c.units?.number}</td>
                                        <td>
                                            {resident ? (
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{resident.profiles?.full_name}</div>
                                                    <div style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>
                                                        {resident.is_owner ? "Propietario" : "Arrendatario"} • {resident.profiles?.email}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ color: "var(--color-gray-400)" }}>Sin info</span>
                                            )}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{formatCLP(c.amount_clp)}</td>
                                        <td>{new Date(c.due_date).toLocaleDateString("es-CL")}</td>
                                        <td>
                                            <span className={`badge ${statusInfo.className}`}>{statusInfo.label}</span>
                                        </td>
                                        <td style={{ textAlign: "right" }}>
                                            <button className="btn btn-sm btn-ghost" onClick={() => alert("Próximamente: Notificar/Cobrar")}>
                                                🔔
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: "var(--color-gray-100)", borderTop: "2px solid var(--color-gray-200)" }}>
                                <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>Total a recaudar:</td>
                                <td colSpan={4} style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                                    {formatCLP(charges.reduce((sum, c) => sum + c.amount_clp, 0))}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </div>
    );
}

export default function ChargesDetailPage() {
    return (
        <Suspense fallback={<p>Cargando...</p>}>
            <ChargesDetailContent />
        </Suspense>
    );
}
