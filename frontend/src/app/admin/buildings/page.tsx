"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Building {
    id: string;
    name: string;
    address: string;
    commune: string;
    region: string;
    rut_edificio: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = 1 | 2;

const REGIONS = [
    "Metropolitana", "Valparaíso", "Biobío", "Maule", "Araucanía",
    "Los Lagos", "O'Higgins", "Coquimbo", "Atacama", "Ñuble",
    "Los Ríos", "Antofagasta", "Arica y Parinacota", "Tarapacá",
    "Magallanes", "Aysen",
];

export default function BuildingsPage() {
    const router = useRouter();
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [step, setStep] = useState<Step>(1);

    // Step 1: building form
    const [form, setForm] = useState({ name: "", address: "", commune: "", region: "Metropolitana", rut_edificio: "" });
    const [saving, setSaving] = useState(false);
    const [newBuildingId, setNewBuildingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Step 2: file upload
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const getToken = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    }, []);

    const fetchBuildings = useCallback(async () => {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/buildings/`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setBuildings(await res.json());
        setLoading(false);
    }, [getToken]);

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm(`¿Estás seguro de que deseas eliminar el edificio "${name}"? Esta acción borrará todas las unidades, residentes y cobros asociados y no se puede deshacer.`)) {
            return;
        }

        try {
            setDeletingId(id);
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/buildings/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Error al eliminar el edificio");

            await fetchBuildings();
        } catch (err: any) {
            alert(err.message || "Ocurrió un error al eliminar el edificio");
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => { fetchBuildings(); }, [fetchBuildings]);

    function closeModal() {
        setShowModal(false);
        setStep(1);
        setForm({ name: "", address: "", commune: "", region: "Metropolitana", rut_edificio: "" });
        setFile(null);
        setNewBuildingId(null);
        setError(null);
    }

    async function handleCreateBuilding(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/buildings/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error("Error al crear el edificio");
            const data = await res.json();
            setNewBuildingId(data.id);
            setStep(2);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setSaving(false);
        }
    }

    async function handleDownloadTemplate() {
        const token = await getToken();
        const res = await fetch(`${API_URL}/api/buildings/template`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "plantilla_unidades.xlsx";
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f && f.name.endsWith(".xlsx")) setFile(f);
        else setError("Solo se aceptan archivos .xlsx");
    }

    async function handleUploadAndPreview() {
        if (!file || !newBuildingId) return;
        setUploading(true);
        setError(null);
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${API_URL}/api/buildings/${newBuildingId}/parse-units`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Error al procesar el archivo");
            }
            const data = await res.json();
            // Store parsed preview data
            sessionStorage.setItem("import_preview", JSON.stringify(data));
            // Store the file as base64 so the preview page can re-submit it
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(Array.from(new Uint8Array(arrayBuffer), c => String.fromCharCode(c)).join(""));
            sessionStorage.setItem("import_file", JSON.stringify({ name: file.name, type: file.type, data: base64 }));
            closeModal();
            router.push(`/admin/buildings/${newBuildingId}/import-preview`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setUploading(false);
        }
    }

    function skipImport() {
        if (!newBuildingId) return;
        fetchBuildings();
        closeModal();
        router.push(`/admin/buildings/${newBuildingId}`);
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
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
                                        <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>{b.address}</p>
                                        <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                            {b.commune} — RUT: {b.rut_edificio}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(e, b.id, b.name)}
                                    disabled={deletingId === b.id}
                                    style={{
                                        background: "none", border: "none", cursor: "pointer",
                                        color: "var(--color-error, #ef4444)", fontSize: "1.25rem",
                                        padding: "0.25rem", opacity: deletingId === b.id ? 0.5 : 1
                                    }}
                                    title="Eliminar edificio"
                                >
                                    🗑️
                                </button>
                            </div>
                        </a>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal animate-fade-in" style={{ maxWidth: 520 }}>
                        {/* Header */}
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">
                                    {step === 1 ? "Nuevo Edificio" : "Importar Unidades"}
                                </h2>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                    Paso {step} de 2 — {step === 1 ? "Datos del edificio" : "Cargar planilla"}
                                </p>
                            </div>
                            <button className="btn btn-ghost" onClick={closeModal} style={{ padding: "0.25rem" }}>✕</button>
                        </div>

                        {/* Progress bar */}
                        <div style={{ height: 3, background: "var(--color-gray-100)", borderRadius: 2, marginBottom: "1.5rem" }}>
                            <div style={{ height: "100%", width: step === 1 ? "50%" : "100%", background: "var(--color-primary)", borderRadius: 2, transition: "width 0.3s ease" }} />
                        </div>

                        {/* ── Step 1: Building details ── */}
                        {step === 1 && (
                            <form onSubmit={handleCreateBuilding}>
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
                                        <select className="form-input" value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>
                                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">RUT del Edificio</label>
                                    <input className="form-input" value={form.rut_edificio} onChange={e => setForm({ ...form, rut_edificio: e.target.value })} placeholder="76543210-5" required />
                                </div>
                                {error && <div className="login-error" style={{ marginBottom: "1rem" }}>{error}</div>}
                                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                                    <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? "Creando..." : "Siguiente →"}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* ── Step 2: Upload ── */}
                        {step === 2 && (
                            <div>
                                {/* Download template CTA */}
                                <div className="card" style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary)", marginBottom: "1.25rem", padding: "1rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.25rem" }}>
                                                📥 Descarga la plantilla
                                            </div>
                                            <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)" }}>
                                                Complétala con los datos de tus departamentos y residents.
                                            </div>
                                        </div>
                                        <button className="btn btn-primary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={handleDownloadTemplate}>
                                            Descargar .xlsx
                                        </button>
                                    </div>
                                </div>

                                {/* Drop zone */}
                                <div
                                    onClick={() => fileRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    style={{
                                        border: `2px dashed ${dragOver || file ? "var(--color-primary)" : "var(--color-gray-300)"}`,
                                        borderRadius: "var(--radius-lg)",
                                        padding: "2.5rem 1.5rem",
                                        textAlign: "center",
                                        cursor: "pointer",
                                        background: dragOver ? "var(--color-primary-light)" : file ? "var(--color-primary-light)" : "transparent",
                                        transition: "all 0.2s ease",
                                        marginBottom: "1.25rem",
                                    }}
                                >
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".xlsx"
                                        style={{ display: "none" }}
                                        onChange={e => {
                                            const f = e.target.files?.[0];
                                            if (f) setFile(f);
                                        }}
                                    />
                                    {file ? (
                                        <>
                                            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✅</div>
                                            <div style={{ fontWeight: 600, color: "var(--color-primary)" }}>{file.name}</div>
                                            <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                                {(file.size / 1024).toFixed(1)} KB — haz clic para cambiar
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "0.75rem" }}>
                                                <polyline points="16 16 12 12 8 16" />
                                                <line x1="12" y1="12" x2="12" y2="21" />
                                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                            </svg>
                                            <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                                                <span style={{ color: "var(--color-primary)" }}>Haz clic para subir</span> o arrastra el archivo
                                            </div>
                                            <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                                Solo archivos .xlsx (máx. 5MB)
                                            </div>
                                        </>
                                    )}
                                </div>

                                {error && <div className="login-error" style={{ marginBottom: "1rem" }}>{error}</div>}

                                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", alignItems: "center" }}>
                                    <button type="button" className="btn btn-ghost" onClick={skipImport} style={{ fontSize: "0.8125rem" }}>
                                        Omitir por ahora
                                    </button>
                                    <div style={{ display: "flex", gap: "0.75rem" }}>
                                        <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Atrás</button>
                                        <button
                                            className="btn btn-primary"
                                            disabled={!file || uploading}
                                            onClick={handleUploadAndPreview}
                                        >
                                            {uploading ? "Procesando..." : "Vista previa →"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
