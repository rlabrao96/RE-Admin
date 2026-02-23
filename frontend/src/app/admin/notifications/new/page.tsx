"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Building { id: string; name: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORIES = [
    { value: "general", label: "📢 General" },
    { value: "maintenance", label: "🔧 Mantención" },
    { value: "financial", label: "💰 Financiero" },
    { value: "emergency", label: "🚨 Emergencia" },
];

export default function NewNotificationPage() {
    const router = useRouter();
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [form, setForm] = useState({
        building_id: "",
        title: "",
        body: "",
        category: "general",
        unit_id: "",
    });
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`${API_URL}/api/buildings/`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) setBuildings(await res.json());
        }
        load();
    }, []);

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const body = {
                building_id: form.building_id,
                title: form.title,
                body: form.body,
                category: form.category,
                ...(form.unit_id ? { unit_id: form.unit_id } : {}),
            };
            const res = await fetch(`${API_URL}/api/notifications/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al enviar");
            router.push("/admin/notifications");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setSending(false);
        }
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <a href="/admin/notifications" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver a Notificaciones
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>Nueva Notificación</h1>
                </div>
            </div>

            <div style={{ maxWidth: 540 }}>
                <div className="card">
                    <form onSubmit={handleSend}>
                        <div className="form-group">
                            <label className="form-label">Edificio</label>
                            <select className="form-input" value={form.building_id} onChange={e => setForm({ ...form, building_id: e.target.value })} required>
                                <option value="">Seleccionar edificio...</option>
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Categoría</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                                {CATEGORIES.map(c => (
                                    <label
                                        key={c.value}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "0.5rem",
                                            padding: "0.625rem 0.875rem",
                                            border: `2px solid ${form.category === c.value ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                            borderRadius: "var(--radius-md)",
                                            cursor: "pointer",
                                            fontWeight: form.category === c.value ? 600 : 400,
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="category"
                                            value={c.value}
                                            checked={form.category === c.value}
                                            onChange={e => setForm({ ...form, category: e.target.value })}
                                            style={{ display: "none" }}
                                        />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Título</label>
                            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Corte de agua programado" required />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Mensaje</label>
                            <textarea
                                className="form-input"
                                style={{ minHeight: 120, resize: "vertical" }}
                                value={form.body}
                                onChange={e => setForm({ ...form, body: e.target.value })}
                                placeholder="Estimados residentes, les informamos..."
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Unidad específica (opcional)</label>
                            <input
                                className="form-input"
                                value={form.unit_id}
                                onChange={e => setForm({ ...form, unit_id: e.target.value })}
                                placeholder="ID de unidad (dejar vacío para enviar a todos)"
                            />
                            <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Si no especificas unidad, se enviará a <strong>todos los residentes</strong> del edificio.
                            </p>
                        </div>

                        {error && <div className="login-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

                        <button type="submit" className="btn btn-primary" disabled={sending} style={{ width: "100%" }}>
                            {sending ? "Enviando..." : "🔔 Enviar Notificación"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
