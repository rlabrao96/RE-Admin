"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

interface Unit {
    id: string;
    number: string;
    type: string;
    surface_m2?: number;
    alicuota: number;
    residents?: Array<{ id: string; is_owner: boolean; profiles?: { full_name: string } }>;
}

interface FloorGroup {
    floor: { id: string; number: number };
    units: Unit[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const UNIT_TYPE_LABELS: Record<string, string> = {
    departamento: "Depto",
    local: "Local",
    bodega: "Bodega",
    estacionamiento: "Estac.",
    otro: "Otro",
};

export default function BuildingDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [building, setBuilding] = useState<{ name: string; address: string; commune: string; rut_edificio: string } | null>(null);
    const [floors, setFloors] = useState<FloorGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [openFloors, setOpenFloors] = useState<Set<string>>(new Set());
    const [showAddUnit, setShowAddUnit] = useState<string | null>(null); // floor_id
    const [newUnit, setNewUnit] = useState({ number: "", type: "departamento", surface_m2: "", alicuota: "" });

    const getToken = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    }, []);

    const fetchData = useCallback(async () => {
        const token = await getToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [buildingRes, unitsRes] = await Promise.all([
            fetch(`${API_URL}/api/buildings/${id}`, { headers }),
            fetch(`${API_URL}/api/buildings/${id}/units`, { headers }),
        ]);
        if (buildingRes.ok) setBuilding(await buildingRes.json());
        if (unitsRes.ok) {
            const data: FloorGroup[] = await unitsRes.json();
            setFloors(data);
            // Open all floors by default
            setOpenFloors(new Set(data.map((g) => g.floor.id)));
        }
        setLoading(false);
    }, [id, getToken]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function toggleFloor(floorId: string) {
        setOpenFloors((prev) => {
            const next = new Set(prev);
            if (next.has(floorId)) next.delete(floorId);
            else next.add(floorId);
            return next;
        });
    }

    async function handleAddUnit(floorId: string) {
        const token = await getToken();
        if (!token) return;
        await fetch(`${API_URL}/api/floors/${floorId}/units`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                number: newUnit.number,
                type: newUnit.type,
                surface_m2: newUnit.surface_m2 ? parseFloat(newUnit.surface_m2) : null,
                alicuota: parseFloat(newUnit.alicuota) || 0,
            }),
        });
        setShowAddUnit(null);
        setNewUnit({ number: "", type: "departamento", surface_m2: "", alicuota: "" });
        fetchData();
    }

    const totalUnits = floors.reduce((s, g) => s + g.units.length, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <a href="/admin/buildings" style={{ fontSize: "0.875rem", color: "var(--color-primary)", textDecoration: "none" }}>
                        ← Volver a Edificios
                    </a>
                    <h1 className="page-title" style={{ marginTop: "0.25rem" }}>
                        {loading ? "Cargando..." : building?.name}
                    </h1>
                    {building && (
                        <p className="page-subtitle">
                            {building.address}, {building.commune} · RUT: {building.rut_edificio} · {totalUnits} unidades
                        </p>
                    )}
                </div>
            </div>

            {loading ? (
                <p style={{ color: "var(--color-gray-500)" }}>Cargando unidades...</p>
            ) : floors.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                    <p>No hay pisos. Agrega un piso primero.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {floors.map(({ floor, units }) => (
                        <div key={floor.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                            {/* Floor header */}
                            <button
                                onClick={() => toggleFloor(floor.id)}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "1rem 1.25rem", background: "transparent", border: "none",
                                    cursor: "pointer", fontWeight: 600, fontSize: "0.9375rem",
                                }}
                            >
                                <span>🏗️ Piso {floor.number} — {units.length} unidad{units.length !== 1 ? "es" : ""}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <button
                                        className="btn btn-ghost"
                                        style={{ padding: "0.25rem 0.75rem", fontSize: "0.8125rem" }}
                                        onClick={(e) => { e.stopPropagation(); setShowAddUnit(floor.id); }}
                                    >
                                        + Agregar Unidad
                                    </button>
                                    <span style={{ transition: "transform 0.2s", transform: openFloors.has(floor.id) ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                                </div>
                            </button>

                            {/* Units table */}
                            {openFloors.has(floor.id) && (
                                <div style={{ borderTop: "1px solid var(--color-gray-200)" }}>
                                    {units.length === 0 ? (
                                        <p style={{ padding: "1rem 1.25rem", color: "var(--color-gray-500)", fontSize: "0.875rem" }}>
                                            No hay unidades en este piso.
                                        </p>
                                    ) : (
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Unidad</th>
                                                    <th>Tipo</th>
                                                    <th>Sup. (m²)</th>
                                                    <th>Alícuota</th>
                                                    <th>Residente</th>
                                                    <th>Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {units.map((unit) => {
                                                    const resident = unit.residents?.[0];
                                                    return (
                                                        <tr key={unit.id}>
                                                            <td><strong>{unit.number}</strong></td>
                                                            <td><span className="badge badge-primary">{UNIT_TYPE_LABELS[unit.type] ?? unit.type}</span></td>
                                                            <td>{unit.surface_m2 ?? "—"}</td>
                                                            <td>{unit.alicuota}%</td>
                                                            <td>{resident?.profiles?.full_name ?? <span style={{ color: "var(--color-gray-300)" }}>Sin asignar</span>}</td>
                                                            <td>
                                                                {resident
                                                                    ? <span className="badge badge-success">Ocupado</span>
                                                                    : <span className="badge badge-warning">Disponible</span>
                                                                }
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}

                                    {/* Add Unit inline form */}
                                    {showAddUnit === floor.id && (
                                        <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--color-gray-100)", background: "var(--color-gray-50)" }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto auto", gap: "0.75rem", alignItems: "flex-end" }}>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Nº Unidad</label>
                                                    <input className="form-input" value={newUnit.number} onChange={e => setNewUnit({ ...newUnit, number: e.target.value })} placeholder="101" />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Tipo</label>
                                                    <select className="form-input" value={newUnit.type} onChange={e => setNewUnit({ ...newUnit, type: e.target.value })}>
                                                        <option value="departamento">Departamento</option>
                                                        <option value="local">Local</option>
                                                        <option value="bodega">Bodega</option>
                                                        <option value="estacionamiento">Estacionamiento</option>
                                                    </select>
                                                </div>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Sup. (m²)</label>
                                                    <input className="form-input" type="number" value={newUnit.surface_m2} onChange={e => setNewUnit({ ...newUnit, surface_m2: e.target.value })} placeholder="65.5" />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Alícuota (%)</label>
                                                    <input className="form-input" type="number" step="0.01" value={newUnit.alicuota} onChange={e => setNewUnit({ ...newUnit, alicuota: e.target.value })} placeholder="3.5" />
                                                </div>
                                                <button className="btn btn-primary" onClick={() => handleAddUnit(floor.id)}>Agregar</button>
                                                <button className="btn btn-ghost" onClick={() => setShowAddUnit(null)}>Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
