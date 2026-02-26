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
    residents?: Array<{ id: string; is_owner: boolean; profiles?: { full_name: string; email?: string } }>;
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
    const [building, setBuilding] = useState<{ id?: string, name: string; address: string; commune: string; region?: string; rut_edificio: string; interest_rate_percent?: number; grace_period_days?: number; late_payment_fine_utm?: number } | null>(null);
    const [floors, setFloors] = useState<FloorGroup[]>([]);

    // Penalty config state
    const [showPenaltySettings, setShowPenaltySettings] = useState(false);
    const [penaltyData, setPenaltyData] = useState({ interest_rate_percent: 0.0, grace_period_days: 10, late_payment_fine_utm: 1.0 });
    const [savingPenalty, setSavingPenalty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [openFloors, setOpenFloors] = useState<Set<string>>(new Set());
    const [showAddUnit, setShowAddUnit] = useState<string | null>(null); // floor_id
    const [newUnit, setNewUnit] = useState({ number: "", type: "departamento", surface_m2: "", alicuota: "" });
    const [showEditResidents, setShowEditResidents] = useState<string | null>(null); // unit_id
    const [editStep, setEditStep] = useState<'select' | 'owner' | 'tenant'>('select');
    const [editResidentData, setEditResidentData] = useState({
        owner: { name: "", lastname: "", email: "", rut: "" },
        tenant: { name: "", lastname: "", email: "", rut: "" },
    });
    const [savingResidents, setSavingResidents] = useState(false);

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
        if (buildingRes.ok) {
            const bData = await buildingRes.json();
            setBuilding(bData);
            setPenaltyData({
                interest_rate_percent: bData.interest_rate_percent || 0.0,
                grace_period_days: bData.grace_period_days || 10,
                late_payment_fine_utm: bData.late_payment_fine_utm || 1.0
            });
        }
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

    function openEditResidents(unit: Unit) {
        const owner = unit.residents?.find(r => r.is_owner)?.profiles || null;
        const tenant = unit.residents?.find(r => !r.is_owner)?.profiles || null;

        const splitName = (fullName?: string) => {
            if (!fullName) return { name: "", lastname: "" };
            const parts = fullName.split(" ");
            return { name: parts.shift() || "", lastname: parts.join(" ") || "" };
        };

        const ownerName = splitName(owner?.full_name);
        const tenantName = splitName(tenant?.full_name);

        setEditResidentData({
            owner: { name: ownerName.name, lastname: ownerName.lastname, email: owner?.email || "", rut: "" },
            tenant: { name: tenantName.name, lastname: tenantName.lastname, email: tenant?.email || "", rut: "" },
        });
        setShowEditResidents(unit.id);
        setEditStep('select');
    }

    async function handleSaveResidents(unitId: string) {
        setSavingResidents(true);
        try {
            const token = await getToken();
            if (!token) return;

            const payload = {
                owner: editResidentData.owner.email ? editResidentData.owner : null,
                tenant: editResidentData.tenant.email ? editResidentData.tenant : null,
            };

            await fetch(`${API_URL}/api/units/${unitId}/residents`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            setShowEditResidents(null);
            fetchData();
        } finally {
            setSavingResidents(false);
        }
    }

    async function handleSavePenaltySettings() {
        setSavingPenalty(true);
        try {
            const token = await getToken();
            if (!token || !building) return;

            const payload = {
                name: building.name,
                address: building.address,
                commune: building.commune,
                region: building.region || "",
                rut_edificio: building.rut_edificio,
                interest_rate_percent: parseFloat(penaltyData.interest_rate_percent.toString()) || 0,
                grace_period_days: parseInt(penaltyData.grace_period_days.toString(), 10) || 10,
                late_payment_fine_utm: parseFloat(penaltyData.late_payment_fine_utm.toString()) || 1.0,
            };

            console.log("SENDING PAYLOAD:", payload);

            const res = await fetch(`${API_URL}/api/buildings/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const updated = await res.json();
                setBuilding(updated);
                setShowPenaltySettings(false);
            } else {
                const errText = await res.text();
                alert(`Error ${res.status}: ${res.statusText} - ${errText}`);
            }
        } finally {
            setSavingPenalty(false);
        }
    }

    const totalUnits = floors.reduce((s, g) => s + g.units.length, 0);

    return (
        <div>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
                {building && (
                    <button className="btn btn-secondary" onClick={() => setShowPenaltySettings(true)}>
                        ⚙️ Configuración Penalizaciones
                    </button>
                )}
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
                                                    <th>Propietario</th>
                                                    <th>Arrendatario</th>
                                                    <th>Residente Oficial</th>
                                                    <th>Estado</th>
                                                    <th style={{ textAlign: "right" }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {units.map((unit) => {
                                                    const owner = unit.residents?.find(r => r.is_owner);
                                                    const tenant = unit.residents?.find(r => !r.is_owner);
                                                    const officialResident = tenant || owner;

                                                    return (
                                                        <tr key={unit.id}>
                                                            <td><strong>{unit.number}</strong></td>
                                                            <td><span className="badge badge-primary">{UNIT_TYPE_LABELS[unit.type] ?? unit.type}</span></td>
                                                            <td>{unit.surface_m2 ?? "—"}</td>
                                                            <td>{unit.alicuota}%</td>
                                                            <td>{owner?.profiles?.full_name ?? <span style={{ color: "var(--color-gray-300)" }}>—</span>}</td>
                                                            <td>{tenant?.profiles?.full_name ?? <span style={{ color: "var(--color-gray-300)" }}>—</span>}</td>
                                                            <td>
                                                                {officialResident ? (
                                                                    <span style={{ fontWeight: officialResident === tenant ? 600 : 400 }}>
                                                                        {officialResident.profiles?.full_name}
                                                                        {officialResident === tenant && <span style={{ fontSize: "0.8em", marginLeft: "4px", color: "var(--color-gray-500)" }}> (Arr.)</span>}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: "var(--color-gray-300)" }}>Sin asignar</span>
                                                                )}
                                                            </td>
                                                            <td>
                                                                {officialResident
                                                                    ? <span className="badge badge-success">Ocupado</span>
                                                                    : <span className="badge badge-warning">Disponible</span>
                                                                }
                                                            </td>
                                                            <td style={{ textAlign: "right" }}>
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.8125rem" }}
                                                                    onClick={() => openEditResidents(unit)}
                                                                >
                                                                    ✏️ Editar
                                                                </button>
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

            {/* Edit Residents Modal */}
            {showEditResidents && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div className="card" style={{ width: "90%", maxWidth: "450px", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>

                        {editStep === 'select' && (
                            <>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", textAlign: "center" }}>Editar Residentes</h2>
                                <p style={{ textAlign: "center", color: "var(--color-gray-500)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                                    ¿Qué rol deseas modificar o asignar?
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                    <button
                                        style={{ padding: "1rem", fontSize: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-gray-50)", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all 0.2s" }}
                                        onClick={() => setEditStep('owner')}
                                    >
                                        <div style={{ textAlign: "left" }}>
                                            <div style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>Propietario</div>
                                            <div style={{ color: "var(--color-gray-500)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                                                {editResidentData.owner.email ? editResidentData.owner.name || editResidentData.owner.email : "Sin un propietario asignado"}
                                            </div>
                                        </div>
                                        <span style={{ color: "var(--color-gray-400)" }}>&rarr;</span>
                                    </button>
                                    <button
                                        style={{ padding: "1rem", fontSize: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-gray-50)", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all 0.2s" }}
                                        onClick={() => setEditStep('tenant')}
                                    >
                                        <div style={{ textAlign: "left" }}>
                                            <div style={{ fontWeight: 600, color: "var(--color-gray-900)" }}>Arrendatario</div>
                                            <div style={{ color: "var(--color-gray-500)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                                                {editResidentData.tenant.email ? editResidentData.tenant.name || editResidentData.tenant.email : "Sin un arrendatario asignado"}
                                            </div>
                                        </div>
                                        <span style={{ color: "var(--color-gray-400)" }}>&rarr;</span>
                                    </button>
                                </div>
                                <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                                    <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => setShowEditResidents(null)}>Cancelar</button>
                                </div>
                            </>
                        )}

                        {editStep === 'owner' && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem", gap: "0.5rem" }}>
                                    <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", marginLeft: "-0.5rem" }} onClick={() => setEditStep('select')}>&larr;</button>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Propietario</h2>
                                </div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginBottom: "1.5rem" }}>
                                    Modifica los datos del propietario. Si dejas el <strong>Email</strong> en blanco, se eliminará su acceso.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={editResidentData.owner.email} onChange={e => setEditResidentData({ ...editResidentData, owner: { ...editResidentData.owner, email: e.target.value } })} placeholder="ejemplo@correo.cl" />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                                        <label className="form-label">Nombre</label>
                                        <input className="form-input" value={editResidentData.owner.name} onChange={e => setEditResidentData({ ...editResidentData, owner: { ...editResidentData.owner, name: e.target.value } })} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                                        <label className="form-label">Apellido</label>
                                        <input className="form-input" value={editResidentData.owner.lastname} onChange={e => setEditResidentData({ ...editResidentData, owner: { ...editResidentData.owner, lastname: e.target.value } })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">RUT (Opcional)</label>
                                    <input className="form-input" value={editResidentData.owner.rut} onChange={e => setEditResidentData({ ...editResidentData, owner: { ...editResidentData.owner, rut: e.target.value } })} placeholder="12345678-9" />
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", borderTop: "1px solid var(--color-gray-200)", paddingTop: "1.5rem" }}>
                                    <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => handleSaveResidents(showEditResidents!)} disabled={savingResidents}>
                                        {savingResidents ? "Guardando..." : "Guardar Cambios"}
                                    </button>
                                </div>
                            </>
                        )}

                        {editStep === 'tenant' && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem", gap: "0.5rem" }}>
                                    <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", marginLeft: "-0.5rem" }} onClick={() => setEditStep('select')}>&larr;</button>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Arrendatario</h2>
                                </div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginBottom: "1.5rem" }}>
                                    Modifica los datos del arrendatario. Si dejas el <strong>Email</strong> en blanco, se eliminará su acceso.
                                </p>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={editResidentData.tenant.email} onChange={e => setEditResidentData({ ...editResidentData, tenant: { ...editResidentData.tenant, email: e.target.value } })} placeholder="ejemplo@correo.cl" />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                                        <label className="form-label">Nombre</label>
                                        <input className="form-input" value={editResidentData.tenant.name} onChange={e => setEditResidentData({ ...editResidentData, tenant: { ...editResidentData.tenant, name: e.target.value } })} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                                        <label className="form-label">Apellido</label>
                                        <input className="form-input" value={editResidentData.tenant.lastname} onChange={e => setEditResidentData({ ...editResidentData, tenant: { ...editResidentData.tenant, lastname: e.target.value } })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">RUT (Opcional)</label>
                                    <input className="form-input" value={editResidentData.tenant.rut} onChange={e => setEditResidentData({ ...editResidentData, tenant: { ...editResidentData.tenant, rut: e.target.value } })} placeholder="12345678-9" />
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", borderTop: "1px solid var(--color-gray-200)", paddingTop: "1.5rem" }}>
                                    <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => handleSaveResidents(showEditResidents!)} disabled={savingResidents}>
                                        {savingResidents ? "Guardando..." : "Guardar Cambios"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Penalty Settings Modal */}
            {showPenaltySettings && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                    <div className="card" style={{ width: "90%", maxWidth: "450px", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Configuración de Penalizaciones</h2>
                        <p style={{ color: "var(--color-gray-500)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                            Define las reglas para el cobro automático de intereses y control de morosidad (Ley 21.442).
                        </p>

                        <div className="form-group">
                            <label className="form-label">Tasa de Interés Mensual por Mora (%)</label>
                            <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                value={penaltyData.interest_rate_percent}
                                onChange={e => setPenaltyData({ ...penaltyData, interest_rate_percent: parseFloat(e.target.value) || 0 })}
                            />
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Se aplicará al monto de la deuda este porcentaje cada mes.
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Día de Vencimiento / Gracia (del mes)</label>
                            <input
                                className="form-input"
                                type="number"
                                min="1"
                                max="28"
                                value={penaltyData.grace_period_days}
                                onChange={e => setPenaltyData({ ...penaltyData, grace_period_days: parseInt(e.target.value) || 10 })}
                            />
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Ejemplo: 10 significa que al día 11 los cargos impagos pasan a estar en Mora.
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
                                Multa por Atraso (UTM)
                                <span style={{ fontWeight: 400, color: penaltyData.late_payment_fine_utm < 1 || penaltyData.late_payment_fine_utm > 3 ? "var(--color-error)" : "var(--color-gray-400)" }}>
                                    (Rango: 1 - 3)
                                </span>
                            </label>
                            <input
                                className="form-input"
                                type="number"
                                step="0.1"
                                min="1"
                                max="3"
                                value={penaltyData.late_payment_fine_utm}
                                onChange={e => setPenaltyData({ ...penaltyData, late_payment_fine_utm: parseFloat(e.target.value) || 0 })}
                                style={{
                                    borderColor: (penaltyData.late_payment_fine_utm < 1 || penaltyData.late_payment_fine_utm > 3) ? "var(--color-error)" : ""
                                }}
                            />
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
                                Según Ley 21.442, la multa por atraso debe estar entre 1 y 3 UTM.
                            </p>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
                            <button className="btn btn-ghost" onClick={() => setShowPenaltySettings(false)} disabled={savingPenalty}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSavePenaltySettings}
                                disabled={savingPenalty || penaltyData.late_payment_fine_utm < 1 || penaltyData.late_payment_fine_utm > 3}
                            >
                                {savingPenalty ? "Guardando..." : "Guardar Cambios"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
