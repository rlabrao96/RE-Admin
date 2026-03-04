"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBuildings } from "@/hooks/api/useBuildings";
import { useDocuments } from "@/hooks/api/useDocuments";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function GlobalDocumentsPage() {
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");

    // Use React Query hooks
    const { data: buildings = [], isLoading: buildingsLoading } = useBuildings();
    const {
        data: documents = [],
        isLoading: documentsLoading,
        error: documentsError,
        refetch: refetchDocuments
    } = useDocuments(selectedBuildingId);

    const [uploading, setUploading] = useState(false);

    // Upload state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [newDocName, setNewDocName] = useState("");
    const [newDocFile, setNewDocFile] = useState<File | null>(null);
    const [newDocBuildingId, setNewDocBuildingId] = useState("");
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [newDocVisible, setNewDocVisible] = useState(true);

    const handleUpload = async () => {
        if (!newDocFile || !newDocName || !newDocBuildingId) return;
        setUploading(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const formData = new FormData();
            formData.append("building_id", newDocBuildingId);
            formData.append("name", newDocName);
            formData.append("is_visible", newDocVisible.toString());
            formData.append("file", newDocFile);

            const res = await fetch(`${API_URL}/api/documents/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: formData,
            });

            if (res.ok) {
                setShowUploadModal(false);
                setNewDocName("");
                setNewDocFile(null);
                setNewDocBuildingId("");
                refetchDocuments();
            } else {
                const err = await res.json();
                alert(err.detail || "Error al subir el documento.");
            }
        } catch (err) {
            alert("Error de red al subir el documento.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string) => {
        if (!confirm("¿Seguro que deseas eliminar este documento?")) return;
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch(`${API_URL}/api/documents/${docId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (res.ok) {
                refetchDocuments();
            } else {
                alert("Error al eliminar el documento.");
            }
        } catch (err) {
            alert("Error de red al intentar eliminar.");
        }
    };

    const toggleVisibility = async (docId: string, current: boolean) => {
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch(`${API_URL}/api/documents/${docId}/visibility`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ is_visible: !current }),
            });
            if (res.ok) {
                refetchDocuments();
            }
        } catch (err) {
            console.error("Error toggling visibility:", err);
        }
    };

    const handleView = async (docId: string) => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        try {
            const res = await fetch(`${API_URL}/api/documents/${docId}/url`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (res.ok) {
                const { url, content_type, file_path } = await res.json();

                // If PDF, open in new tab. Others download.
                const isPdf = content_type === 'application/pdf' || (file_path && file_path.toLowerCase().endsWith('.pdf'));

                if (isPdf) {
                    // Fetch the file and create a blob URL with the correct content type to force browser PDF viewer
                    const fileRes = await fetch(url);
                    const blob = await fileRes.blob();
                    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
                    const blobUrl = URL.createObjectURL(pdfBlob);
                    window.open(blobUrl, "_blank");
                } else {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = '';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        } catch (err) {
            console.error("Error fetching doc URL:", err);
            alert("Error al generar el enlace de visualización.");
        }
    };

    const loading = buildingsLoading || documentsLoading;

    return (
        <div className="container" style={{ padding: "2rem" }}>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <div>
                    <h1 className="page-title">Repositorio de Documentos</h1>
                    <p className="page-subtitle">Gestiona todos los documentos de la comunidad</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                    + Subir Documento
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center" }}>
                <select
                    className="form-input"
                    value={selectedBuildingId}
                    onChange={(e) => setSelectedBuildingId(e.target.value)}
                    style={{ width: "auto", minWidth: "250px" }}
                >
                    <option value="">Todos los edificios</option>
                    {buildings.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>

                {selectedBuildingId && (
                    <button className="btn btn-ghost" onClick={() => setSelectedBuildingId("")}>
                        Limpiar
                    </button>
                )}
            </div>

            {documentsError && (
                <div style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    color: "var(--color-error)",
                    border: "1px solid rgba(220, 38, 38, 0.2)",
                    background: "rgba(220, 38, 38, 0.05)",
                    borderRadius: "0.5rem"
                }}>
                    ⚠️ {(documentsError as Error).message}
                </div>
            )}

            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "4rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando documentos...</p>
                ) : documents.length === 0 ? (
                    <div style={{ padding: "4rem", textAlign: "center", color: "var(--color-gray-400)" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📁</div>
                        <p>No se encontraron documentos.</p>
                        {selectedBuildingId && <button className="btn btn-link" onClick={() => setSelectedBuildingId("")}>Ver todos</button>}
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Edificio</th>
                                <th>Fecha</th>
                                <th>Visible</th>
                                <th style={{ textAlign: "right" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((doc: any) => (
                                <tr key={doc.id}>
                                    <td style={{ fontWeight: 500 }}>{doc.name}</td>
                                    <td style={{ color: "var(--color-gray-500)" }}>{doc.buildings?.name || "Global"}</td>
                                    <td>{new Date(doc.uploaded_at || doc.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <label className="switch">
                                                <input
                                                    type="checkbox"
                                                    checked={doc.is_visible}
                                                    onChange={() => toggleVisibility(doc.id, doc.is_visible)}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                            <span style={{
                                                fontSize: "0.75rem",
                                                color: doc.is_visible ? "var(--color-success)" : "var(--color-gray-500)",
                                                fontWeight: 600,
                                                verticalAlign: "middle"
                                            }}>
                                                {doc.is_visible ? "Visible" : "Oculto"}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleView(doc.id)} title="Ver">👁️</button>
                                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => handleDelete(doc.id)} title="Eliminar">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="modal-overlay">
                    <div className="modal animate-fade-in" style={{ maxWidth: "500px" }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Subir Nuevo Documento</h2>
                            <button className="close-btn" onClick={() => setShowUploadModal(false)}>×</button>
                        </div>
                        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            <div className="form-group">
                                <label className="form-label">Nombre del Documento</label>
                                <input
                                    className="form-input"
                                    placeholder="Ej: Reglamento Interno"
                                    value={newDocName}
                                    onChange={(e) => setNewDocName(e.target.value)}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Edificio (Destino)</label>
                                <select
                                    className="form-input"
                                    value={newDocBuildingId}
                                    onChange={(e) => setNewDocBuildingId(e.target.value)}
                                    style={{ width: "100%" }}
                                >
                                    <option value="">Seleccionar edificio...</option>
                                    <option value="all" style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                                        🌍 Todos los edificios (Global)
                                    </option>
                                    {buildings.map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                                <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                    Selecciona "Todos los edificios" para documentos generales como leyes o reglamentos compartidos.
                                </p>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Archivo</label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setDragOver(false);
                                        const f = e.dataTransfer.files?.[0];
                                        if (f) {
                                            setNewDocFile(f);
                                            if (!newDocName) setNewDocName(f.name.split('.').slice(0, -1).join('.'));
                                        }
                                    }}
                                    style={{
                                        border: `2px dashed ${dragOver || newDocFile ? "var(--color-primary)" : "var(--color-gray-300)"}`,
                                        borderRadius: "var(--radius-lg)",
                                        padding: "2rem 1rem",
                                        textAlign: "center",
                                        cursor: "pointer",
                                        background: dragOver || newDocFile ? "var(--color-primary-light)" : "var(--color-gray-50)",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] || null;
                                            setNewDocFile(f);
                                            if (f && !newDocName) setNewDocName(f.name.split('.').slice(0, -1).join('.'));
                                        }}
                                        style={{ display: "none" }}
                                    />
                                    {newDocFile ? (
                                        <>
                                            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📄</div>
                                            <p style={{ fontWeight: 600, color: "var(--color-primary)", fontSize: "0.875rem" }}>{newDocFile.name}</p>
                                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>Haz clic para cambiar el archivo</p>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📤</div>
                                            <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>Arrastra o haz clic para subir</p>
                                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>Formatos aceptados: PDF, JPG, PNG, DOCX, XLSX</p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                marginTop: "0.5rem",
                                padding: "0.75rem",
                                background: "var(--color-primary-light)",
                                borderRadius: "var(--radius-md)"
                            }}>
                                <input
                                    type="checkbox"
                                    id="is-visible-checkbox"
                                    checked={newDocVisible}
                                    onChange={(e) => setNewDocVisible(e.target.checked)}
                                    style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                                />
                                <label htmlFor="is-visible-checkbox" className="form-label" style={{ marginBottom: 0, cursor: "pointer", color: "var(--color-primary)" }}>
                                    Visible para residentes inmediatamente
                                </label>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" onClick={() => setShowUploadModal(false)}>Cancelar</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleUpload}
                                disabled={uploading || !newDocName || !newDocFile || !newDocBuildingId}
                                style={{ minWidth: "150px", justifyContent: "center" }}
                            >
                                {uploading ? "Subiendo..." : "Subir Documento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
