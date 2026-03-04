"use client";

import { useState, useMemo } from "react";
import { useBuildings } from "@/hooks/api/useBuildings";
import {
    useBankConfig,
    useFintocMovements,
    useSyncMovements,
    useIgnoreMovement,
    useUnmatchMovement,
    useAccountBalance,
    type FintocMovement,
} from "@/hooks/api/useFintoc";
import AccountSetup from "./AccountSetup";
import ConciliationMode from "./ConciliationMode";

const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
    unmatched: { label: "Sin conciliar", badge: "badge-warning" },
    auto_matched: { label: "Auto", badge: "badge-success" },
    manual_matched: { label: "Manual", badge: "badge-primary" },
    ignored: { label: "Ignorado", badge: "badge-ghost" },
};

function formatCLP(n: number) {
    return "$" + n.toLocaleString("es-CL");
}

function formatMonthLabel(ym: string) {
    const [year, month] = ym.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleString("es-CL", { month: "long", year: "numeric" });
}

export default function ReconciliationPage() {
    const { data: buildings = [] } = useBuildings();
    const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [monthFilter, setMonthFilter] = useState<string>("");
    const [showSetup, setShowSetup] = useState(false);
    const [isConciliationMode, setIsConciliationMode] = useState(false);

    const buildingId = selectedBuilding || (buildings.length > 0 ? buildings[0].id : null);

    const { data: bankConfig, isLoading: configLoading } = useBankConfig(buildingId);
    const { data: movements = [], isLoading: movementsLoading } = useFintocMovements(
        buildingId,
        statusFilter || undefined,
        monthFilter || undefined,
    );
    const syncMutation = useSyncMovements(buildingId);
    const ignoreMutation = useIgnoreMovement(buildingId);
    const unmatchMutation = useUnmatchMovement(buildingId);

    const isLinked = !!bankConfig?.fintoc_link_token;
    const { data: balance } = useAccountBalance(buildingId, isLinked);

    // Derive available months from all movements (unfiltered — use a separate query key without month)
    const { data: allMovements = [] } = useFintocMovements(buildingId, undefined, undefined);
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        for (const m of allMovements) {
            months.add(m.post_date.slice(0, 7)); // "YYYY-MM"
        }
        return Array.from(months).sort().reverse();
    }, [allMovements]);

    // Stats
    const stats = useMemo(() => {
        const total = movements.length;
        const unmatched = movements.filter(m => m.reconciliation_status === "unmatched").length;
        const matched = movements.filter(m => m.reconciliation_status === "auto_matched" || m.reconciliation_status === "manual_matched").length;
        const totalInflow = movements.filter(m => m.type === "inflow").reduce((s, m) => s + m.amount, 0);
        const totalOutflow = movements.filter(m => m.type === "outflow").reduce((s, m) => s + m.amount, 0);
        return { total, unmatched, matched, totalInflow, totalOutflow };
    }, [movements]);

    return (
        <div>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <h1 className="page-title">Conciliación Bancaria</h1>
                    <p className="page-subtitle">Detecta y vincula movimientos bancarios con cobros y gastos del edificio.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <select
                        className="form-input"
                        style={{ width: "auto", minWidth: "200px" }}
                        value={buildingId || ""}
                        onChange={e => setSelectedBuilding(e.target.value)}
                    >
                        {buildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <button className="btn btn-secondary" onClick={() => setShowSetup(!showSetup)}>
                        {showSetup ? "Cerrar Config" : "Config"}
                    </button>
                </div>
            </div>

            {/* Account Setup (collapsible) */}
            {showSetup && buildingId && (
                <div style={{ marginBottom: "1rem" }}>
                    <AccountSetup
                        buildingId={buildingId}
                        existing={bankConfig}
                    />
                </div>
            )}

            {/* Not linked banner */}
            {!configLoading && !isLinked && !showSetup && (
                <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
                    <p style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        Cuenta bancaria no conectada
                    </p>
                    <p style={{ color: "var(--color-gray-500)", marginBottom: "1rem" }}>
                        Configura las credenciales de Fintoc para comenzar a detectar movimientos automáticamente.
                    </p>
                    <button className="btn btn-primary" onClick={() => setShowSetup(true)}>
                        Configurar Cuenta
                    </button>
                </div>
            )}

            {/* Stats + Sync bar */}
            {isLinked && (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
                        {/* Account balance — live from Fintoc */}
                        <div className="card" style={{ padding: "1rem", textAlign: "center", gridColumn: "span 1", borderLeft: "3px solid var(--color-primary)" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-primary)" }}>
                                {balance ? formatCLP(balance.available ?? balance.current ?? 0) : "—"}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Saldo Disponible</div>
                            {balance?.refreshed_at && (
                                <div style={{ fontSize: "0.65rem", color: "var(--color-gray-400)", marginTop: "0.25rem" }}>
                                    {new Date(balance.refreshed_at).toLocaleString("es-CL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </div>
                            )}
                        </div>
                        <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.total}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Movimientos</div>
                        </div>
                        <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-warning)" }}>{stats.unmatched}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Sin conciliar</div>
                        </div>
                        <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-success)" }}>{stats.matched}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Conciliados</div>
                        </div>
                        <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-success)" }}>{formatCLP(stats.totalInflow)}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Total Ingresos</div>
                        </div>
                        <div className="card" style={{ padding: "1rem", textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-error)" }}>{formatCLP(stats.totalOutflow)}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>Total Egresos</div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            {/* Month filter */}
                            <select
                                className="form-input"
                                style={{ width: "auto" }}
                                value={monthFilter}
                                onChange={e => setMonthFilter(e.target.value)}
                            >
                                <option value="">Todos los meses</option>
                                {availableMonths.map(m => (
                                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                                ))}
                            </select>

                            {/* Status filter (hidden in conciliation mode) */}
                            {!isConciliationMode && (
                                <select className="form-input" style={{ width: "auto" }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                    <option value="">Todos</option>
                                    <option value="unmatched">Sin conciliar</option>
                                    <option value="auto_matched">Auto-conciliados</option>
                                    <option value="manual_matched">Manual</option>
                                    <option value="ignored">Ignorados</option>
                                </select>
                            )}

                            {bankConfig?.last_sync_at && (
                                <span style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>
                                    Última sync: {new Date(bankConfig.last_sync_at).toLocaleString("es-CL")}
                                </span>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                className={`btn ${isConciliationMode ? "btn-primary" : "btn-secondary"}`}
                                onClick={() => {
                                    setIsConciliationMode(!isConciliationMode);
                                    setStatusFilter(""); // reset status filter when toggling
                                }}
                            >
                                {isConciliationMode ? "Vista Normal" : "Modo Conciliación"}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => syncMutation.mutate()}
                                disabled={syncMutation.isPending}
                            >
                                {syncMutation.isPending ? "Sincronizando..." : "Sincronizar"}
                            </button>
                        </div>
                    </div>

                    {/* Sync result message */}
                    {syncMutation.isSuccess && (
                        <div style={{ padding: "0.75rem 1rem", background: "#ecfdf5", borderRadius: "var(--radius-md)", marginBottom: "0.75rem", fontSize: "0.875rem", color: "var(--color-success)" }}>
                            {syncMutation.data.message}
                        </div>
                    )}

                    {/* Conciliation Mode / Normal Table */}
                    {isConciliationMode ? (
                        buildingId && (
                            <ConciliationMode
                                buildingId={buildingId}
                                movements={movements.filter(m => m.reconciliation_status === "unmatched")}
                                isLoading={movementsLoading}
                            />
                        )
                    ) : (
                        movementsLoading ? (
                            <p style={{ color: "var(--color-gray-500)" }}>Cargando movimientos...</p>
                        ) : movements.length === 0 ? (
                            <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
                                <p style={{ color: "var(--color-gray-500)" }}>
                                    {statusFilter || monthFilter ? "No hay movimientos con este filtro." : "No hay movimientos. Presiona Sincronizar para importar desde Fintoc."}
                                </p>
                            </div>
                        ) : (
                            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Tipo</th>
                                            <th>Monto</th>
                                            <th>Descripción</th>
                                            <th>Contraparte</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: "right" }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.map((m) => (
                                            <MovementRow
                                                key={m.id}
                                                movement={m}
                                                onIgnore={() => ignoreMutation.mutate(m.id)}
                                                onUnmatch={() => unmatchMutation.mutate(m.id)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </>
            )}
        </div>
    );
}

// ── Movement Row ─────────────────────────────────────────────────────────────

function MovementRow({
    movement: m,
    onIgnore,
    onUnmatch,
}: {
    movement: FintocMovement;
    onIgnore: () => void;
    onUnmatch: () => void;
}) {
    const statusInfo = STATUS_LABELS[m.reconciliation_status] || { label: m.reconciliation_status, badge: "" };
    const isMatched = m.reconciliation_status === "auto_matched" || m.reconciliation_status === "manual_matched";

    return (
        <tr>
            <td style={{ whiteSpace: "nowrap" }}>{m.post_date}</td>
            <td>
                <span className={`badge ${m.type === "inflow" ? "badge-success" : "badge-error"}`}>
                    {m.type === "inflow" ? "Ingreso" : "Egreso"}
                </span>
            </td>
            <td style={{ fontWeight: 600, color: m.type === "inflow" ? "var(--color-success)" : "var(--color-error)" }}>
                {m.type === "inflow" ? "+" : "-"}{"$" + m.amount.toLocaleString("es-CL")}
            </td>
            <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.description || "—"}
            </td>
            <td>
                <div style={{ fontSize: "0.8125rem" }}>{m.holder_name || "—"}</div>
                {m.holder_id && <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>{m.holder_id}</div>}
            </td>
            <td>
                <span className={`badge ${statusInfo.badge}`}>{statusInfo.label}</span>
            </td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {m.reconciliation_status === "unmatched" && (
                    <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={onIgnore}>
                        Ignorar
                    </button>
                )}
                {isMatched && (
                    <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={onUnmatch}>
                        Deshacer
                    </button>
                )}
                {m.reconciliation_status === "ignored" && (
                    <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={onUnmatch}>
                        Restaurar
                    </button>
                )}
            </td>
        </tr>
    );
}
