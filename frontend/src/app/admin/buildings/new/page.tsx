"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = 1 | 2 | 3;

const REGIONS = [
    "Metropolitana", "Valparaíso", "Biobío", "Maule", "Araucanía",
    "Los Lagos", "O'Higgins", "Coquimbo", "Atacama", "Ñuble",
    "Los Ríos", "Antofagasta", "Arica y Parinacota", "Tarapacá",
    "Magallanes", "Aysen",
];

export default function NewBuildingPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 1: Form
    const [form, setForm] = useState({
        name: "",
        address: "",
        commune: "",
        region: "Metropolitana",
        rut_edificio: "",
        interest_rate_percent: 1.5,
        late_payment_fine_utm: 1.0,
        due_day: 10,
        grace_period_days: 10,
    });

    // Step 2: File
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Step 3: Audit
    const [previewRows, setPreviewRows] = useState<any[]>([]);
    const [totalM2, setTotalM2] = useState(0);

    const getToken = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    }, []);

    const handleNextStep1 = (e: React.FormEvent) => {
        e.preventDefault();
        setStep(2);
    };

    const handleDownloadTemplate = async () => {
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
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f && f.name.endsWith(".xlsx")) setFile(f);
        else setError("Solo se aceptan archivos .xlsx");
    };

    const handleUploadAndPreview = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${API_URL}/api/buildings/parse-template`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Error al procesar el archivo");
            }
            const data = await res.json();
            setPreviewRows(data.rows);
            setTotalM2(data.total_m2);
            setStep(3);
        } catch (err: any) {
            setError(err.message || "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append("file", file);
            formData.append("building_data", JSON.stringify(form));

            const res = await fetch(`${API_URL}/api/buildings/create-with-import`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Error al crear el edificio");
            }

            router.push("/admin/buildings");
            router.refresh();
        } catch (err: any) {
            setError(err.message || "Ocurrió un error inesperado");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem" }}>
            <div style={{ marginBottom: "2rem" }}>
                <button
                    onClick={() => router.push("/admin/buildings")}
                    className="btn btn-ghost"
                    style={{ marginBottom: "1rem", paddingLeft: 0 }}
                >
                    ← Volver a edificios
                </button>
                <h1 style={{ fontSize: "1.875rem", fontWeight: 700 }}>Nuevo Edificio</h1>
                <p style={{ color: "var(--color-gray-500)" }}>
                    Sigue los pasos para crear un edificio e importar sus unidades.
                </p>
            </div>

            {/* Progress indicator */}
            <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
                {[1, 2, 3].map((s) => (
                    <div key={s} style={{ flex: 1 }}>
                        <div style={{
                            height: 4,
                            background: step >= s ? "var(--color-primary)" : "var(--color-gray-200)",
                            borderRadius: 2,
                            transition: "background 0.3s ease"
                        }} />
                        <p style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            marginTop: "0.5rem",
                            color: step >= s ? "var(--color-primary)" : "var(--color-gray-500)"
                        }}>
                            Paso {s}: {s === 1 ? "Datos" : s === 2 ? "Carga" : "Auditoría"}
                        </p>
                    </div>
                ))}
            </div>

            <div className="card" style={{ padding: "2rem" }}>
                {/* ── STEP 1 ── */}
                {step === 1 && (
                    <form onSubmit={handleNextStep1}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Datos del Edificio</h2>
                        <div className="form-group">
                            <label className="form-label">Nombre del Edificio</label>
                            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Edificio Central" required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Dirección</label>
                            <input className="form-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ej: Av. Providencia 123" required />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                            <div className="form-group">
                                <label className="form-label">Comuna</label>
                                <input className="form-input" value={form.commune} onChange={e => setForm({ ...form, commune: e.target.value })} placeholder="Ej: Providencia" required />
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
                            <input className="form-input" value={form.rut_edificio} onChange={e => setForm({ ...form, rut_edificio: e.target.value })} placeholder="76.543.210-K" required />
                        </div>

                        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-gray-100)" }}>
                            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", color: "var(--color-primary)" }}>Parámetros de Cobro</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                                <div className="form-group">
                                    <label className="form-label">Interés Mensual (%)</label>
                                    <input type="number" step="0.01" className="form-input" value={form.interest_rate_percent} onChange={e => setForm({ ...form, interest_rate_percent: parseFloat(e.target.value) })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Multa Atraso (UTM)</label>
                                    <input type="number" step="0.1" className="form-input" value={form.late_payment_fine_utm} onChange={e => setForm({ ...form, late_payment_fine_utm: parseFloat(e.target.value) })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Día Vencimiento</label>
                                    <input type="number" min="1" max="31" className="form-input" value={form.due_day} onChange={e => setForm({ ...form, due_day: parseInt(e.target.value) })} required />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2rem" }}>
                            <button type="submit" className="btn btn-primary">Siguiente Paso →</button>
                        </div>
                    </form>
                )}

                {/* ── STEP 2 ── */}
                {step === 2 && (
                    <div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Carga de Unidades</h2>
                        <div className="card" style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary)", marginBottom: "2rem", padding: "1.25rem" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div>
                                    <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Descarga la plantilla Excel</p>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-600)" }}>Usa este formato para asegurar que los datos se importen correctamente.</p>
                                </div>
                                <button className="btn btn-primary" onClick={handleDownloadTemplate}>Descargar Plantilla</button>
                            </div>
                        </div>

                        <div
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            style={{
                                border: `2px dashed ${dragOver || file ? "var(--color-primary)" : "var(--color-gray-300)"}`,
                                borderRadius: "var(--radius-lg)",
                                padding: "4rem 2rem", textAlign: "center", cursor: "pointer",
                                background: dragOver || file ? "var(--color-primary-light)" : "transparent",
                                transition: "all 0.2s ease", marginBottom: "2rem",
                            }}
                        >
                            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                            {file ? (
                                <>
                                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📄</div>
                                    <p style={{ fontWeight: 600, color: "var(--color-primary)", fontSize: "1.125rem" }}>{file.name}</p>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginTop: "0.5rem" }}>Haz clic para cambiar el archivo</p>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📤</div>
                                    <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>Sube tu archivo Excel aquí</p>
                                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginTop: "0.5rem" }}>Arrastra o haz clic para seleccionar</p>
                                </>
                            )}
                        </div>

                        {error && <div className="login-error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Atrás</button>
                            <button className="btn btn-primary" disabled={!file || loading} onClick={handleUploadAndPreview}>
                                {loading ? "Procesando..." : "Ver Auditoría →"}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 3 ── */}
                {step === 3 && (
                    <div>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "var(--color-gray-50)",
                            padding: "1.5rem",
                            borderRadius: "var(--radius-lg)",
                            marginBottom: "2rem",
                            border: "1px solid var(--color-gray-200)"
                        }}>
                            <div>
                                <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>Edificio</p>
                                <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{form.name}</p>
                            </div>
                            <div style={{ textAlign: "right", display: "flex", gap: "2.5rem" }}>
                                <div>
                                    <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", textTransform: "uppercase", fontWeight: 700 }}>Unidades</p>
                                    <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{previewRows.length}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", textTransform: "uppercase", fontWeight: 700 }}>Superficie</p>
                                    <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>{totalM2.toFixed(1)} m²</p>
                                </div>
                            </div>
                        </div>

                        <h3 style={{ fontWeight: 600, marginBottom: "1rem" }}>Listado de Unidades a Importar</h3>
                        <div style={{ border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-md)", marginBottom: "2rem", overflow: "hidden" }}>
                            <table className="table" style={{ fontSize: "0.8125rem", width: "100%", tableLayout: "fixed" }}>
                                <thead style={{ background: "var(--color-gray-50)" }}>
                                    <tr>
                                        <th style={{ width: "110px", padding: "0.75rem" }}>Depto / Piso</th>
                                        <th style={{ width: "110px", padding: "0.75rem" }}>M² / %</th>
                                        <th style={{ padding: "0.75rem" }}>Propietario</th>
                                        <th style={{ padding: "0.75rem" }}>Arrendatario</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                                            <td style={{ padding: "0.75rem" }}>
                                                <div style={{ fontWeight: 700 }}>{r.unit_number}</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Piso {r.floor}</div>
                                            </td>
                                            <td style={{ padding: "0.75rem" }}>
                                                <div>{r.surface_m2} m²</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{r.alicuota}%</div>
                                            </td>
                                            <td style={{ padding: "0.75rem" }}>
                                                {r.owner_name ? (
                                                    <>
                                                        <div style={{ fontWeight: 600 }}>{r.owner_name} {r.owner_lastname}</div>
                                                        {r.owner_rut && <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{r.owner_rut}</div>}
                                                        <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>
                                                            {[r.owner_email, r.owner_phone].filter(Boolean).join(" · ") || "-"}
                                                        </div>
                                                    </>
                                                ) : <span style={{ color: "var(--color-gray-300)" }}>-</span>}
                                            </td>
                                            <td style={{ padding: "0.75rem" }}>
                                                {r.tenant_name ? (
                                                    <>
                                                        <div style={{ fontWeight: 600 }}>{r.tenant_name} {r.tenant_lastname}</div>
                                                        {r.tenant_rut && <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{r.tenant_rut}</div>}
                                                        <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>
                                                            {[r.tenant_email, r.tenant_phone].filter(Boolean).join(" · ") || "-"}
                                                        </div>
                                                    </>
                                                ) : <span style={{ color: "var(--color-gray-300)" }}>-</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {error && <div className="login-error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
                            <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>← Volver a Carga</button>
                            <button className="btn btn-primary" disabled={loading} onClick={handleConfirmImport}>
                                {loading ? "Creando Edificio..." : "Confirmar e Importar Todo"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
