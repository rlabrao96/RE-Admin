"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ParsedRow {
    unit_number: string | null;
    floor: number | null;
    surface_m2: number | null;
    alicuota: number | null;
    owner_name: string | null;
    owner_lastname: string | null;
    owner_rut: string | null;
    owner_email: string | null;
    tenant_name: string | null;
    tenant_lastname: string | null;
    tenant_rut: string | null;
    tenant_email: string | null;
}

interface BuildingSummary {
    id: string;
    name: string;
    address: string;
    commune: string;
    rut_edificio: string;
}

interface PreviewData {
    building: BuildingSummary;
    rows: ParsedRow[];
    total_m2: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function rowHasError(r: ParsedRow): boolean {
    return !r.unit_number || !r.floor || !r.surface_m2;
}

function rowStatus(r: ParsedRow): "error" | "ok" {
    return rowHasError(r) ? "error" : "ok";
}

export default function ImportPreviewPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [importing, setImporting] = useState(false);
    const [done, setDone] = useState(false);
    const [importResult, setImportResult] = useState<{ units_created: number; invitations_sent: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Recover file from sessionStorage for the actual import
    const [storedFile, setStoredFile] = useState<File | null>(null);

    const getToken = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    }, []);

    useEffect(() => {
        const raw = sessionStorage.getItem("import_preview");
        if (raw) {
            setPreview(JSON.parse(raw));
        } else {
            // No data — redirect back
            router.push(`/admin/buildings/${id}`);
        }

        // Get the file from sessionStorage if stored as base64
        const fileData = sessionStorage.getItem("import_file");
        if (fileData) {
            const { name, type, data } = JSON.parse(fileData);
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            setStoredFile(new File([bytes], name, { type }));
        }
    }, [id, router]);

    async function handleConfirm() {
        if (!storedFile) {
            setError("No se encontró el archivo original. Por favor regresa y vuelve a subir.");
            return;
        }
        setImporting(true);
        setError(null);
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append("file", storedFile);
            const res = await fetch(`${API_URL}/api/buildings/${id}/import-units`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Error al importar");
            }
            const result = await res.json();
            setImportResult(result);
            setDone(true);
            sessionStorage.removeItem("import_preview");
            sessionStorage.removeItem("import_file");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setImporting(false);
        }
    }

    if (!preview) {
        return <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando vista previa...</div>;
    }

    const { building, rows, total_m2 } = preview;
    const errorCount = rows.filter(rowHasError).length;
    const validCount = rows.length - errorCount;
    const floors = Array.from(new Set(rows.map(r => r.floor).filter(Boolean))).length;

    if (done && importResult) {
        return (
            <div style={{ maxWidth: 560, margin: "4rem auto", textAlign: "center" }}>
                <div className="card" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
                    <h1 style={{ fontWeight: 700, fontSize: "1.5rem", marginBottom: "0.5rem" }}>¡Edificio configurado!</h1>
                    <p style={{ color: "var(--color-gray-500)", marginBottom: "2rem" }}>
                        Se crearon <strong>{importResult.units_created}</strong> unidades y se enviaron{" "}
                        <strong>{importResult.invitations_sent}</strong> invitaciones por correo.
                    </p>
                    <button className="btn btn-primary" onClick={() => router.push(`/admin/buildings/${id}`)}>
                        Ver edificio →
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <button
                        onClick={() => router.back()}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", color: "var(--color-primary)", padding: 0, marginBottom: "0.25rem", display: "block" }}
                    >
                        ← Volver
                    </button>
                    <h1 className="page-title">Vista Previa de Importación</h1>
                    <p className="page-subtitle">Revisa los datos antes de confirmar la creación</p>
                </div>
            </div>

            {/* Building summary card */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{
                        width: 56, height: 56, flexShrink: 0,
                        background: "var(--color-primary-light)",
                        borderRadius: "var(--radius-lg)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.75rem",
                    }}>🏢</div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.25rem" }}>{building.name}</h2>
                        <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                            {building.address}, {building.commune} · RUT: {building.rut_edificio}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "1.5rem" }}>
                        {[
                            { label: "Pisos", value: floors },
                            { label: "Unidades", value: rows.length },
                            { label: "m² totales", value: total_m2.toFixed(1) },
                            { label: "Con errores", value: errorCount, danger: errorCount > 0 },
                        ].map(s => (
                            <div key={s.label} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: s.danger ? "var(--color-danger)" : "var(--color-text)" }}>{s.value}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Validation notice */}
            {errorCount > 0 && (
                <div style={{ background: "#FFF3CD", border: "1px solid #FBBF24", borderRadius: "var(--radius)", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
                    ⚠️ <strong>{errorCount} fila{errorCount !== 1 ? "s" : ""}</strong> tiene{errorCount !== 1 ? "n" : ""} datos faltantes y no se importará{errorCount !== 1 ? "n" : ""}. Corrígelas en el Excel y vuelve a importar.
                </div>
            )}

            {/* Table */}
            <div className="table-wrapper" style={{ marginBottom: "1.5rem" }}>
                <table>
                    <thead>
                        <tr>
                            <th>Estado</th>
                            <th>Piso</th>
                            <th>Unidad</th>
                            <th>Metraje</th>
                            <th>Alícuota</th>
                            <th>Propietario</th>
                            <th>Correo Propietario</th>
                            <th>Arrendatario</th>
                            <th>Correo Arrendatario</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const status = rowStatus(r);
                            return (
                                <tr key={i} style={status === "error" ? { background: "#FFF5F5" } : {}}>
                                    <td>
                                        {status === "ok"
                                            ? <span className="badge badge-success">✓</span>
                                            : <span className="badge badge-danger">✗ Error</span>
                                        }
                                    </td>
                                    <td>{r.floor ?? <span style={{ color: "var(--color-danger)" }}>—</span>}</td>
                                    <td><strong>{r.unit_number ?? <span style={{ color: "var(--color-danger)" }}>—</span>}</strong></td>
                                    <td>{r.surface_m2 ? `${r.surface_m2} m²` : <span style={{ color: "var(--color-danger)" }}>—</span>}</td>
                                    <td>{r.alicuota != null ? `${r.alicuota}%` : "—"}</td>
                                    <td>
                                        {r.owner_name || r.owner_lastname
                                            ? `${r.owner_name ?? ""} ${r.owner_lastname ?? ""}`.trim()
                                            : <span style={{ color: "var(--color-gray-400)" }}>—</span>
                                        }
                                    </td>
                                    <td style={{ fontSize: "0.8125rem" }}>{r.owner_email ?? <span style={{ color: "var(--color-gray-400)" }}>—</span>}</td>
                                    <td>
                                        {r.tenant_name || r.tenant_lastname
                                            ? `${r.tenant_name ?? ""} ${r.tenant_lastname ?? ""}`.trim()
                                            : <span style={{ color: "var(--color-gray-400)" }}>—</span>
                                        }
                                    </td>
                                    <td style={{ fontSize: "0.8125rem" }}>{r.tenant_email ?? <span style={{ color: "var(--color-gray-400)" }}>—</span>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {error && <div className="login-error" style={{ marginBottom: "1rem" }}>{error}</div>}

            {/* Footer bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                    {validCount} unidad{validCount !== 1 ? "es" : ""} válida{validCount !== 1 ? "s" : ""} listas para importar
                    {errorCount > 0 && ` · ${errorCount} con errores serán omitidas`}
                </p>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button className="btn btn-ghost" onClick={() => router.push(`/admin/buildings/${id}`)}>
                        Cancelar
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirm}
                        disabled={importing || validCount === 0}
                    >
                        {importing ? "Importando..." : `✓ Confirmar e importar ${validCount} unidades`}
                    </button>
                </div>
            </div>
        </div>
    );
}
