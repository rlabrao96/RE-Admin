"use client";

import { useState } from "react";
import {
    useMatchAsExpense,
    useIgnoreMovement,
    type FintocMovement,
} from "@/hooks/api/useFintoc";

const EXPENSE_CATEGORIES = [
    "Servicios Básicos",
    "Remuneraciones",
    "Administración",
    "Mantención",
    "Reparaciones",
    "Aseo y Limpieza",
    "Seguros",
    "Gastos Legales",
    "Otros",
];

function formatCLP(n: number) {
    return "$" + n.toLocaleString("es-CL");
}

interface ExpenseCardProps {
    movement: FintocMovement;
    buildingId: string;
}

export default function ExpenseCard({ movement, buildingId }: ExpenseCardProps) {
    const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
    const [concept, setConcept] = useState<string>(movement.description || "");
    const [error, setError] = useState<string | null>(null);

    const period = movement.post_date.slice(0, 7);

    const matchExpenseMutation = useMatchAsExpense(buildingId);
    const ignoreMutation = useIgnoreMovement(buildingId);

    async function handleRegistrar() {
        if (!concept.trim()) return;
        setError(null);
        try {
            await matchExpenseMutation.mutateAsync({
                movement_id: movement.id,
                category,
                concept: concept.trim(),
                building_id: buildingId,
                period,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al registrar gasto");
        }
    }

    async function handleIgnorar() {
        setError(null);
        try {
            await ignoreMutation.mutateAsync(movement.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al ignorar");
        }
    }

    const isPending = matchExpenseMutation.isPending || ignoreMutation.isPending;

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "130px 1fr 180px 160px auto",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.625rem 0.875rem",
            borderBottom: "1px solid var(--color-border)",
            background: "white",
            fontSize: "0.8125rem",
        }}>
            {/* Amount + date */}
            <div>
                <div style={{ fontWeight: 700, color: "var(--color-error)" }}>
                    -{formatCLP(movement.amount)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-gray-400)" }}>
                    {movement.post_date}
                </div>
            </div>

            {/* Description / counterpart */}
            <div style={{ overflow: "hidden" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-gray-700)" }}>
                    {movement.holder_name || movement.description || "—"}
                </div>
                {movement.holder_name && movement.description && (
                    <div style={{ fontSize: "0.7rem", color: "var(--color-gray-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {movement.description}
                    </div>
                )}
            </div>

            {/* Category */}
            <select
                className="form-input"
                style={{ padding: "0.25rem 0.375rem", fontSize: "0.75rem", height: "2rem" }}
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={isPending}
            >
                {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                ))}
            </select>

            {/* Concept */}
            <input
                className="form-input"
                type="text"
                style={{ padding: "0.25rem 0.375rem", fontSize: "0.75rem", height: "2rem" }}
                placeholder="Concepto..."
                value={concept}
                onChange={e => setConcept(e.target.value)}
                disabled={isPending}
                onKeyDown={e => e.key === "Enter" && !isPending && concept.trim() && handleRegistrar()}
            />

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", whiteSpace: "nowrap" }}>
                <button
                    className="btn btn-primary"
                    style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem", height: "2rem" }}
                    onClick={handleRegistrar}
                    disabled={!concept.trim() || isPending}
                    title="Registrar como gasto"
                >
                    {matchExpenseMutation.isPending ? "..." : "Registrar"}
                </button>
                <button
                    className="btn btn-ghost"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", height: "2rem" }}
                    onClick={handleIgnorar}
                    disabled={isPending}
                    title="Ignorar movimiento"
                >
                    Ignorar
                </button>
                {error && (
                    <span style={{ color: "var(--color-error)", fontSize: "0.7rem" }} title={error}>!</span>
                )}
            </div>
        </div>
    );
}
