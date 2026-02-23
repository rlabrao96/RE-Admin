"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Resident {
    id: string;
    full_name: string;
    email: string;
    unit_number: string;
    building_id: string;
    building_name: string;
    is_owner: boolean;
    pending_charges: number;
}

interface Building {
    id: string;
    name: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ResidentsPage() {
    const [residents, setResidents] = useState<Resident[]>([]);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterBuilding, setFilterBuilding] = useState("");
    const [filterName, setFilterName] = useState("");

    const getSession = useCallback(async () => {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    }, []);

    const fetchBuildings = useCallback(async () => {
        const session = await getSession();
        if (!session) return;
        const res = await fetch(`${API_URL}/api/buildings/`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setBuildings(await res.json());
    }, [getSession]);

    const fetchResidents = useCallback(async () => {
        setLoading(true);
        const session = await getSession();
        if (!session) return;

        const params = new URLSearchParams();
        if (filterBuilding) params.set("building_id", filterBuilding);

        const res = await fetch(`${API_URL}/api/residents/?${params}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setResidents(await res.json());
        setLoading(false);
    }, [getSession, filterBuilding]);

    useEffect(() => {
        fetchBuildings();
    }, [fetchBuildings]);

    useEffect(() => {
        fetchResidents();
    }, [fetchResidents]);

    const filtered = residents.filter(r =>
        !filterName || r.full_name.toLowerCase().includes(filterName.toLowerCase()) || r.email.toLowerCase().includes(filterName.toLowerCase())
    );

    const totalPending = filtered.reduce((s, r) => s + r.pending_charges, 0);

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Residentes</h1>
                    <p className="page-subtitle">Gestiona los residentes de tus edificios</p>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
                <div className="stat-card">
                    <span className="stat-label">Residentes Activos</span>
                    <span className="stat-value">{filtered.length}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Cobros Pendientes</span>
                    <span className="stat-value" style={{ color: totalPending > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                        {totalPending}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Propietarios</span>
                    <span className="stat-value">{filtered.filter(r => r.is_owner).length}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-label">Arrendatarios</span>
                    <span className="stat-value">{filtered.filter(r => !r.is_owner).length}</span>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <select
                    className="form-input"
                    style={{ width: "auto", minWidth: "200px" }}
                    value={filterBuilding}
                    onChange={e => setFilterBuilding(e.target.value)}
                >
                    <option value="">Todos los edificios</option>
                    {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
                <input
                    className="form-input"
                    style={{ minWidth: "220px" }}
                    placeholder="Buscar por nombre o email..."
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                />
                {(filterBuilding || filterName) && (
                    <button className="btn btn-ghost" onClick={() => { setFilterBuilding(""); setFilterName(""); }}>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="table-wrapper">
                {loading ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando residentes...</p>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>👤</div>
                        <p style={{ color: "var(--color-gray-500)" }}>No se encontraron residentes.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Residente</th>
                                <th>Edificio / Unidad</th>
                                <th>Tipo</th>
                                <th style={{ textAlign: "center" }}>Cobros Pendientes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                                        <div style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>{r.email}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{r.building_name}</div>
                                        <div style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>Unidad {r.unit_number}</div>
                                    </td>
                                    <td>
                                        <span className={`badge ${r.is_owner ? "badge-primary" : "badge-warning"}`}>
                                            {r.is_owner ? "Propietario" : "Arrendatario"}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                        {r.pending_charges > 0 ? (
                                            <span className="badge badge-danger">{r.pending_charges}</span>
                                        ) : (
                                            <span className="badge badge-success">Al día</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
