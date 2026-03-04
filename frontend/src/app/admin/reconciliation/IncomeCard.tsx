"use client";

import { useState } from "react";
import {
    useUnitsWithPendingCharges,
    useWaterfallMatch,
    useMatchAsOther,
    useIgnoreMovement,
    type FintocMovement,
    type UnitWithPendingCharges,
} from "@/hooks/api/useFintoc";

const PRIORITY_LABELS: Record<number, string> = {
    1: "Multas",
    2: "Intereses",
    3: "GGCC Ant.",
    4: "GGCC Corriente",
};

function formatCLP(n: number) {
    return "$" + n.toLocaleString("es-CL");
}

interface IncomeCardProps {
    movement: FintocMovement;
    buildingId: string;
}

export default function IncomeCard({ movement, buildingId }: IncomeCardProps) {
    const [selectedUnitId, setSelectedUnitId] = useState<string>("");
    const [showOtro, setShowOtro] = useState(false);
    const [otroLabel, setOtroLabel] = useState("");
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: units = [], isLoading: unitsLoading, isError: unitsError } = useUnitsWithPendingCharges(buildingId);
    const waterfallMutation = useWaterfallMatch(buildingId);
    const matchOtherMutation = useMatchAsOther(buildingId);
    const ignoreMutation = useIgnoreMovement(buildingId);

    const selectedUnit: UnitWithPendingCharges | undefined = units.find(u => u.unit_id === selectedUnitId);
    const isPending = waterfallMutation.isPending || matchOtherMutation.isPending || ignoreMutation.isPending;

    async function handleVincular() {
        if (!selectedUnitId) return;
        setError(null);
        try {
            await waterfallMutation.mutateAsync({ movement_id: movement.id, unit_id: selectedUnitId });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al vincular");
        }
    }

    async function handleOtro() {
        if (!otroLabel.trim()) return;
        setError(null);
        try {
            await matchOtherMutation.mutateAsync({ movement_id: movement.id, label: otroLabel.trim() });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al registrar");
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

    return (
        <div style={{ borderBottom: "1px solid var(--color-border)", background: "white" }}>
            {/* Main row */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "130px 1fr 200px auto",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.625rem 0.875rem",
                fontSize: "0.8125rem",
            }}>
                {/* Amount + date */}
                <div>
                    <div style={{ fontWeight: 700, color: "var(--color-success)" }}>
                        +{formatCLP(movement.amount)}
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
                    {movement.holder_id && (
                        <div style={{ fontSize: "0.7rem", color: "var(--color-gray-400)" }}>{movement.holder_id}</div>
                    )}
                </div>

                {/* Unit selector */}
                {!showOtro ? (
                    <select
                        className="form-input"
                        style={{ padding: "0.25rem 0.375rem", fontSize: "0.75rem", height: "2rem" }}
                        value={selectedUnitId}
                        onChange={e => {
                            setSelectedUnitId(e.target.value);
                            setShowBreakdown(!!e.target.value);
                            setError(null);
                        }}
                        disabled={unitsLoading || isPending}
                    >
                        <option value="">
                            {unitsLoading ? "Cargando..." : unitsError ? "Error al cargar unidades" : units.length === 0 ? "Sin deuda pendiente" : "Seleccionar unidad..."}
                        </option>
                        {units.map(u => (
                            <option key={u.unit_id} value={u.unit_id}>
                                Unidad {u.unit_number} — {formatCLP(u.total_debt)}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        className="form-input"
                        type="text"
                        style={{ padding: "0.25rem 0.375rem", fontSize: "0.75rem", height: "2rem" }}
                        placeholder="Descripción del ingreso..."
                        value={otroLabel}
                        onChange={e => setOtroLabel(e.target.value)}
                        disabled={isPending}
                        onKeyDown={e => e.key === "Enter" && !isPending && otroLabel.trim() && handleOtro()}
                        autoFocus
                    />
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", whiteSpace: "nowrap" }}>
                    {!showOtro ? (
                        <>
                            <button
                                className="btn btn-primary"
                                style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem", height: "2rem" }}
                                onClick={handleVincular}
                                disabled={!selectedUnitId || isPending}
                            >
                                {waterfallMutation.isPending ? "..." : "Vincular"}
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", height: "2rem" }}
                                onClick={() => { setShowOtro(true); setSelectedUnitId(""); setShowBreakdown(false); }}
                                disabled={isPending}
                                title="Ingreso sin unidad asociada"
                            >
                                Otro
                            </button>
                            <button
                                className="btn btn-ghost"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", height: "2rem" }}
                                onClick={handleIgnorar}
                                disabled={isPending}
                            >
                                Ignorar
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                className="btn btn-primary"
                                style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem", height: "2rem" }}
                                onClick={handleOtro}
                                disabled={!otroLabel.trim() || isPending}
                            >
                                {matchOtherMutation.isPending ? "..." : "Confirmar"}
                            </button>
                            <button
                                className="btn btn-ghost"
                                style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", height: "2rem" }}
                                onClick={() => { setShowOtro(false); setOtroLabel(""); }}
                                disabled={isPending}
                            >
                                Cancelar
                            </button>
                        </>
                    )}
                    {error && (
                        <span style={{ color: "var(--color-error)", fontSize: "0.7rem" }} title={error}>!</span>
                    )}
                </div>
            </div>

            {/* Debt breakdown — only when unit is selected */}
            {showBreakdown && selectedUnit && (
                <div style={{
                    margin: "0 0.875rem 0.625rem",
                    padding: "0.5rem 0.75rem",
                    background: "var(--color-gray-50)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    display: "flex",
                    gap: "1.25rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                }}>
                    {([1, 2, 3, 4] as const).map(priority => {
                        const items = selectedUnit.charges.filter(c => c.priority === priority);
                        if (items.length === 0) return null;
                        const subtotal = items.reduce((s, c) => s + c.remaining, 0);
                        return (
                            <span key={priority} style={{ color: "var(--color-gray-600)" }}>
                                <span style={{ fontWeight: 600 }}>{PRIORITY_LABELS[priority]}:</span> {formatCLP(subtotal)}
                            </span>
                        );
                    })}
                    <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--color-error)" }}>
                        Total: {formatCLP(selectedUnit.total_debt)}
                    </span>
                    <span style={{ color: "var(--color-success)", fontWeight: 600 }}>
                        Pago: +{formatCLP(movement.amount)}
                    </span>
                    {movement.amount < selectedUnit.total_debt && (
                        <span style={{ color: "var(--color-warning)", fontWeight: 500 }}>
                            Pago parcial
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
