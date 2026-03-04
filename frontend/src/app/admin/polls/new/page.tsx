"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Building { id: string; name: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function NewPollPage() {
    const router = useRouter();
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [form, setForm] = useState({
        building_id: "",
        title: "",
        description: "",
        deadline: "",
        show_results_before_deadline: false,
    });
    const [options, setOptions] = useState([
        { label: "Aprobar" },
        { label: "Rechazar" },
    ]);
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

    const addOption = () => {
        setOptions([...options, { label: "" }]);
    };

    const removeOption = (index: number) => {
        if (options.length <= 2) return;
        setOptions(options.filter((_, i) => i !== index));
    };

    const updateOption = (index: number, label: string) => {
        setOptions(options.map((opt, i) => i === index ? { label } : opt));
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        setError(null);

        // Validate options
        const validOptions = options.filter(o => o.label.trim());
        if (validOptions.length < 2) {
            setError("Debes tener al menos 2 opciones");
            setSending(false);
            return;
        }

        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            const body = {
                building_id: form.building_id,
                title: form.title,
                description: form.description,
                deadline: new Date(form.deadline).toISOString(),
                show_results_before_deadline: form.show_results_before_deadline,
                options: validOptions,
            };

            const res = await fetch(`${API_URL}/api/polls/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session!.access_token}`,
                },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Error al crear");
            router.push("/admin/polls");
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
                    <a href="/admin/polls" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver a Votaciones
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>Nueva Votación</h1>
                </div>
            </div>

            <div style={{ maxWidth: 540 }}>
                <div className="card">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Edificio</label>
                            <select
                                className="form-input"
                                value={form.building_id}
                                onChange={e => setForm({ ...form, building_id: e.target.value })}
                                required
                            >
                                <option value="">Seleccionar edificio...</option>
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Título</label>
                            <input
                                className="form-input"
                                value={form.title}
                                onChange={e => setForm({ ...form, title: e.target.value })}
                                placeholder="Aprobación presupuesto 2026"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Descripción</label>
                            <textarea
                                className="form-input"
                                style={{ minHeight: 120, resize: "vertical" }}
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Describa el tema de la votación y lo que se está decidiendo..."
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Fecha límite</label>
                            <input
                                type="datetime-local"
                                className="form-input"
                                value={form.deadline}
                                onChange={e => setForm({ ...form, deadline: e.target.value })}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Opciones de votación</label>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {options.map((opt, i) => (
                                    <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                        <input
                                            className="form-input"
                                            style={{ flex: 1 }}
                                            value={opt.label}
                                            onChange={e => updateOption(i, e.target.value)}
                                            placeholder={`Opción ${i + 1}`}
                                            required
                                        />
                                        {options.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => removeOption(i)}
                                                style={{
                                                    background: "none",
                                                    border: "1px solid var(--color-gray-200)",
                                                    borderRadius: "var(--radius-md)",
                                                    cursor: "pointer",
                                                    padding: "0.5rem",
                                                    color: "var(--color-gray-500)",
                                                    fontSize: "1rem",
                                                }}
                                                title="Eliminar opción"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={addOption}
                                className="btn btn-ghost"
                                style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}
                            >
                                + Agregar opción
                            </button>
                        </div>

                        <div className="form-group">
                            <label style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                padding: "0.75rem 1rem",
                                border: `2px solid ${form.show_results_before_deadline ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                borderRadius: "var(--radius-md)",
                                cursor: "pointer",
                                fontSize: "0.875rem",
                                fontWeight: form.show_results_before_deadline ? 600 : 400,
                            }}>
                                <input
                                    type="checkbox"
                                    checked={form.show_results_before_deadline}
                                    onChange={e => setForm({ ...form, show_results_before_deadline: e.target.checked })}
                                    style={{ width: "1.125rem", height: "1.125rem" }}
                                />
                                Mostrar resultados antes del cierre
                            </label>
                            <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Si está activo, los residentes podrán ver los resultados parciales antes de que termine la votación.
                            </p>
                        </div>

                        {error && <div className="login-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

                        <button type="submit" className="btn btn-primary" disabled={sending} style={{ width: "100%" }}>
                            {sending ? "Creando..." : "🗳 Crear Votación"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
