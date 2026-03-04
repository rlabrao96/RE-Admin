"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useBuildings } from "@/hooks/api/useBuildings";
import { useRouter } from "next/navigation";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function BuildingsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: buildings = [], isLoading: loading } = useBuildings();

    // Deletion Modal State
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [buildingToDelete, setBuildingToDelete] = useState<{ id: string, name: string } | null>(null);

    const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
        e.preventDefault();
        e.stopPropagation();
        setBuildingToDelete({ id, name });
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!buildingToDelete) return;
        const { id } = buildingToDelete;

        try {
            setDeletingId(id);
            setShowDeleteModal(false);
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${API_URL}/api/buildings/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session?.access_token}` },
            });
            if (!res.ok) throw new Error("Error al eliminar el edificio");

            queryClient.invalidateQueries({ queryKey: ["buildings"] });
        } catch (err: any) {
            alert(err.message || "Ocurrió un error al eliminar el edificio");
        } finally {
            setDeletingId(null);
            setBuildingToDelete(null);
        }
    };

    return (
        <div style={{ padding: "2rem" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-gray-900)" }}>Edificios</h1>
                    <p style={{ color: "var(--color-gray-500)" }}>Administra tus edificios y sus unidades</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => router.push("/admin/buildings/new")}
                >
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
                    <button
                        className="btn btn-primary"
                        onClick={() => router.push("/admin/buildings/new")}
                    >
                        Agregar Edificio
                    </button>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
                    {buildings.map((b) => (
                        <div
                            key={b.id}
                            onClick={() => router.push(`/admin/buildings/${b.id}`)}
                            className="card"
                            style={{ cursor: "pointer", display: "block" }}
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
                                    onClick={(e) => handleDeleteClick(e, b.id, b.name)}
                                    disabled={deletingId === b.id}
                                    style={{
                                        background: "none", border: "none", cursor: "pointer",
                                        color: "#ef4444", fontSize: "1.25rem",
                                        padding: "0.25rem", opacity: deletingId === b.id ? 0.5 : 1,
                                        position: "relative", zIndex: 10
                                    }}
                                    title="Eliminar edificio"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && buildingToDelete && (
                <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal animate-fade-in" style={{ maxWidth: 400, textAlign: "center", padding: "2.5rem" }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            fontSize: "3rem", marginBottom: "1.5rem", background: "#fee2e2",
                            width: "80px", height: "80px", borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem"
                        }}>⚠️</div>
                        <h2 className="modal-title" style={{ marginBottom: "1rem" }}>¿Eliminar edificio?</h2>
                        <p style={{ color: "var(--color-gray-500)", marginBottom: "2rem", lineHeight: "1.5" }}>
                            Estás a punto de eliminar <strong>{buildingToDelete.name}</strong>. Esta acción borrará todas las unidades, residentes y cobros asociados de forma permanente.
                        </p>
                        <div style={{ display: "flex", gap: "0.75rem", flexDirection: "column" }}>
                            <button className="btn btn-primary" style={{ background: "#ef4444", border: "none" }} onClick={confirmDelete}>
                                Sí, eliminar permanentemente
                            </button>
                            <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
