"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function PortalDocumentsPage() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDocuments = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // 1. Get resident building_id
        const { data: resident } = await supabase
            .from("residents")
            .select("unit_id, units(floors(building_id))")
            .eq("user_id", session.user.id)
            .eq("status", "active")
            .maybeSingle();

        if (resident) {
            const buildingId = (resident.units as any)?.floors?.building_id;
            if (buildingId) {
                const res = await fetch(`${API_URL}/api/documents/portal?building_id=${buildingId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (res.ok) {
                    setDocuments(await res.json());
                }
            }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleViewDoc = async (docId: string) => {
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
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Documentos</h1>
                    <p className="page-subtitle">Repositorio de documentos de tu edificio</p>
                </div>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)", textAlign: "center", padding: "2rem" }}>Cargando documentos...</p>
            ) : documents.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📄</div>
                    <p style={{ color: "var(--color-gray-500)" }}>No hay documentos disponibles en este momento.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {documents.map((doc: any) => (
                        <div
                            key={doc.id}
                            className="card"
                            onClick={() => handleViewDoc(doc.id)}
                            style={{
                                display: "flex",
                                gap: "1rem",
                                alignItems: "center",
                                cursor: "pointer",
                                transition: "all 0.2s"
                            }}
                        >
                            <div style={{
                                width: 44, height: 44, flexShrink: 0,
                                background: "var(--color-primary-light)",
                                borderRadius: "var(--radius-md)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "1.5rem",
                            }}>
                                📄
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                                    <span style={{ fontWeight: 600, fontSize: "1rem" }}>{doc.name}</span>
                                    {!doc.building_id && <span className="badge badge-primary" style={{ fontSize: "0.65rem" }}>Global</span>}
                                </div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-400)" }}>
                                    {new Date(doc.uploaded_at || doc.created_at).toLocaleDateString("es-CL")} · {(doc.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                            <div style={{ color: "var(--color-primary)", fontWeight: 500, fontSize: "0.875rem" }}>
                                Ver / Descargar →
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
