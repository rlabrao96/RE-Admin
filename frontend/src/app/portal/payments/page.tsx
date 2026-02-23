import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Mis Pagos — EdificioApp" };

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

const METHOD_LABELS: Record<string, string> = {
    webpay: "Webpay Plus",
    transferencia: "Transferencia",
    efectivo: "Efectivo",
};

export default async function PortalPaymentsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: resident } = await supabase
        .from("residents")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

    const { data: payments } = resident
        ? await supabase
            .from("payments")
            .select("*, charges(concept, period)")
            .eq("resident_id", resident.id)
            .order("paid_at", { ascending: false })
        : { data: [] };

    const total = (payments ?? []).reduce((s: number, p: { amount_clp: number }) => s + p.amount_clp, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Mis Pagos</h1>
                    <p className="page-subtitle">Total pagado: {formatCLP(total)}</p>
                </div>
            </div>

            {(payments ?? []).length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>💳</div>
                    <p style={{ color: "var(--color-gray-500)" }}>Aún no tienes pagos registrados.</p>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th>Período</th>
                                <th>Método</th>
                                <th>Monto</th>
                                <th>Fecha</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(payments ?? []).map((p: { id: string; charges?: { concept: string; period: string }; payment_method: string; amount_clp: number; paid_at: string }) => (
                                <tr key={p.id}>
                                    <td>{p.charges?.concept ?? "—"}</td>
                                    <td>{p.charges?.period ?? "—"}</td>
                                    <td>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                                    <td style={{ fontWeight: 600 }}>{formatCLP(p.amount_clp)}</td>
                                    <td>{new Date(p.paid_at).toLocaleDateString("es-CL")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
