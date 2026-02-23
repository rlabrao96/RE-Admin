"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Building {
    id: string;
    name: string;
    address: string;
    commune: string;
    region: string;
    rut_edificio: string;
}

interface NewBuilding {
    name: string;
    address: string;
    commune: string;
    region: string;
    rut_edificio: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function BuildingsPage() {
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<NewBuilding>({
        name: "",
        address: "",
        commune: "",
        region: "Metropolitana",
        rut_edificio: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBuildings = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(`${API_URL}/api/buildings/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
            const data = await res.json();
            setBuildings(data);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchBuildings(); }, [fetchBuildings]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/api/buildings/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session!.access_token}`,
                },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error("Error al crear el edificio");
            await fetchBuildings();
            setShowModal(false);
            setForm({ name: "", address: "", commune: "", region: "Metropolitana", rut_edificio: "" });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Edificios</h1>
                    <p className="page-subtitle">Administra tus edificios y sus unidades</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <span>+</span> Nuevo Edificio
                </button>
            </div>

            {/* Grid */}
            {loading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando edificios...</p>
            ) : buildings.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏢</div>
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        Aún no tienes edificios
                    </h2>
                    <p style={{ color: "var(--color-gray-500)", marginBottom: "1.5rem" }}>
                        Agrega tu primer edificio para comenzar a gestionar sus unidades.
                    </p>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        Agregar Edificio
                    </button>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
                    {buildings.map((b) => (
                        <a
                            key={b.id}
                            href={`/admin/buildings/${b.id}`}
                            className="card"
                            style={{ textDecoration: "none", cursor: "pointer", display: "block" }}
                        >
                            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                                <div style={{
                                    width: 48, height: 48, flexShrink: 0,
                                    background: "var(--color-primary-light)",
                                    borderRadius: "var(--radius-lg)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "1.5rem",
                                }}>🏢</div>
                                <div>
                                    <h3 style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{b.name}</h3>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                                        {b.address}
                                    </p>
                                    <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                        {b.commune} — RUT: {b.rut_edificio}
                                    </p>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="modal animate-fade-in">
                        <div className="modal-header">
                            <h2 className="modal-title">Nuevo Edificio</h2>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)} style={{ padding: "0.25rem" }}>✕</button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label className="form-label">Nombre del Edificio</label>
                                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Edificio Las Torres" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Dirección</label>
                                <input className="form-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Av. Providencia 1234" required />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                <div className="form-group">
                                    <label className="form-label">Comuna</label>
                                    <input className="form-input" value={form.commune} onChange={e => setForm({ ...form, commune: e.target.value })} placeholder="Providencia" required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Región</label>
                                    <input className="form-input" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} placeholder="Metropolitana" required />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">RUT del Edificio</label>
                                <input className="form-input" value={form.rut_edificio} onChange={e => setForm({ ...form, rut_edificio: e.target.value })} placeholder="76543210-5" required />
                            </div>
                            {error && <div className="login-error" style={{ marginBottom: "1rem" }}>{error}</div>}
                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Crear Edificio"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
