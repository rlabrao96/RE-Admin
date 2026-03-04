"use client";

import { type FintocMovement } from "@/hooks/api/useFintoc";
import IncomeCard from "./IncomeCard";
import ExpenseCard from "./ExpenseCard";

interface ConciliationModeProps {
    buildingId: string;
    movements: FintocMovement[];
    isLoading: boolean;
}

export default function ConciliationMode({ buildingId, movements, isLoading }: ConciliationModeProps) {
    const inflows = movements.filter(m => m.type === "inflow");
    const outflows = movements.filter(m => m.type === "outflow");

    if (isLoading) {
        return <p style={{ color: "var(--color-gray-500)" }}>Cargando movimientos...</p>;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Income bucket */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "130px 1fr 200px auto",
                    gap: "0.5rem",
                    padding: "0.5rem 0.875rem",
                    background: "#f0fdf4",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-success)",
                }}>
                    <span>Ingresos ({inflows.length})</span>
                    <span>Contraparte / Descripción</span>
                    <span>Unidad</span>
                    <span>Acciones</span>
                </div>

                {inflows.length === 0 ? (
                    <div style={{ padding: "1.25rem", textAlign: "center", color: "var(--color-gray-400)", fontSize: "0.8125rem" }}>
                        No hay ingresos pendientes.
                    </div>
                ) : (
                    inflows.map(m => (
                        <IncomeCard key={m.id} movement={m} buildingId={buildingId} />
                    ))
                )}
            </div>

            {/* Expense bucket */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "130px 1fr 180px 160px auto",
                    gap: "0.5rem",
                    padding: "0.5rem 0.875rem",
                    background: "#fff1f2",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--color-error)",
                }}>
                    <span>Egresos ({outflows.length})</span>
                    <span>Contraparte / Descripción</span>
                    <span>Categoría</span>
                    <span>Concepto</span>
                    <span>Acciones</span>
                </div>

                {outflows.length === 0 ? (
                    <div style={{ padding: "1.25rem", textAlign: "center", color: "var(--color-gray-400)", fontSize: "0.8125rem" }}>
                        No hay egresos pendientes.
                    </div>
                ) : (
                    outflows.map(m => (
                        <ExpenseCard key={m.id} movement={m} buildingId={buildingId} />
                    ))
                )}
            </div>
        </div>
    );
}
