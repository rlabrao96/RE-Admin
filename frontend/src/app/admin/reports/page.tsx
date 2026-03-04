"use client";

import { useState, useMemo } from "react";
import { useBuildings } from "@/hooks/api/useBuildings";
import { useExpenses } from "@/hooks/api/useExpenses";
import { useChargeSummaries } from "@/hooks/api/useChargeSummaries";
import { useCharges, Charge } from "@/hooks/api/useCharges";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Legend
} from "recharts";

import { useUnits } from "@/hooks/api/useUnits";

function formatCLP(n: number) { return `$${n.toLocaleString("es-CL")}`; }

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<"general" | "buildings" | "residents">("buildings");
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");

    const { data: buildings } = useBuildings();
    // Period is null to fetch ALL historical expenses for the chosen building
    const { data: allExpenses } = useExpenses(selectedBuildingId || null);
    const { data: allSummaries } = useChargeSummaries();

    // Fetch all charges for the building (no period filter) for the Residents debt report
    const { data: allBuildingCharges } = useCharges(selectedBuildingId || null, null);
    const { data: floorsWithUnits } = useUnits(selectedBuildingId || null);

    // Last 6 months labels
    const last6Months = useMemo(() => {
        let referenceDate = new Date();

        // Find latest period with data for the selected building to anchor the charts
        if (selectedBuildingId && allSummaries) {
            const buildingSummaries = allSummaries.filter(s => s.building_id === selectedBuildingId);
            if (buildingSummaries.length > 0) {
                const maxPeriod = buildingSummaries.reduce((max, s) => s.period > max ? s.period : max, buildingSummaries[0].period);
                const [year, month] = maxPeriod.split("-").map(Number);
                referenceDate = new Date(year, month - 1, 1);
            }
        }

        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
            d.setMonth(d.getMonth() - i);
            months.push(d.toISOString().slice(0, 7));
        }
        return months;
    }, [allSummaries, selectedBuildingId]);

    // Helper to format YYYY-MM to Month Name
    const getMonthLabel = (period: string) => {
        const [year, month] = period.split("-").map(Number);
        const date = new Date(year, month - 1, 1);
        return date.toLocaleDateString('es-CL', { month: 'short' });
    };

    // Data for Expenses Evolution
    const expensesData = useMemo(() => {
        if (!selectedBuildingId || !allExpenses) {
            return last6Months.map(p => ({ name: getMonthLabel(p), amount: 0 }));
        }
        return last6Months.map(period => {
            const total = allExpenses
                .filter(e => e.period === period)
                .reduce((sum, e) => sum + e.amount_clp, 0);
            return {
                name: getMonthLabel(period),
                fullPeriod: period,
                amount: total
            };
        });
    }, [allExpenses, selectedBuildingId, last6Months]);

    // Data for Payment & Collection Evolution
    const paymentData = useMemo(() => {
        if (!selectedBuildingId || !allSummaries) {
            return last6Months.map(p => ({
                name: getMonthLabel(p),
                percentage: 0,
                collected: 0
            }));
        }
        return last6Months.map(period => {
            const summary = allSummaries.find(s => s.building_id === selectedBuildingId && s.period === period);
            return {
                name: getMonthLabel(period),
                fullPeriod: period,
                percentage: summary ? summary.percent_paid : 0,
                collected: summary ? summary.paid_amount : 0
            };
        });
    }, [allSummaries, selectedBuildingId, last6Months]);

    // Data for Cash Balance (Real Calculation)
    const cashData = useMemo(() => {
        if (!selectedBuildingId || !allSummaries || !allExpenses) {
            return last6Months.map(p => ({ name: getMonthLabel(p), balance: 0 }));
        }

        // We'll calculate a running balance based on collections vs expenses
        // Starting with a base level if it's the first time
        let runningBalance = 0;

        // Sort all periods to calculate historical balance
        const allAvailablePeriods = Array.from(new Set([
            ...(allSummaries?.filter(s => s.building_id === selectedBuildingId).map(s => s.period) || []),
            ...(allExpenses?.map(e => e.period) || [])
        ])).sort();

        const periodBalances: Record<string, number> = {};
        allAvailablePeriods.forEach(p => {
            const collected = allSummaries?.find(s => s.building_id === selectedBuildingId && s.period === p)?.paid_amount || 0;
            const expensed = allExpenses?.filter(e => e.period === p).reduce((sum, e) => sum + e.amount_clp, 0) || 0;
            runningBalance += (collected - expensed);
            periodBalances[p] = runningBalance;
        });

        return last6Months.map(period => ({
            name: getMonthLabel(period),
            fullPeriod: period,
            balance: periodBalances[period] ?? runningBalance
        }));
    }, [allSummaries, allExpenses, selectedBuildingId, last6Months]);

    // Resident Debt Calculation
    const residentDebtData = useMemo(() => {
        if (!selectedBuildingId || !allBuildingCharges || !floorsWithUnits) return [];

        const units = floorsWithUnits.flatMap(f => f.units);
        const debtPerUnit = units.map(u => {
            const unitCharges = allBuildingCharges.filter((c: Charge) => c.unit_id === u.id);
            const totalDebt = unitCharges
                .filter((c: Charge) => c.status !== "paid")
                .reduce((sum: number, c: Charge) => sum + c.amount_clp, 0);

            const totalPaid = unitCharges
                .filter((c: Charge) => c.status === "paid")
                .reduce((sum: number, c: Charge) => sum + c.amount_clp, 0);

            const totalInvoiced = unitCharges.reduce((sum: number, c: Charge) => sum + c.amount_clp, 0);

            return {
                id: u.id,
                number: u.number,
                owner: u.residents?.find(r => r.is_owner)?.profiles?.full_name || "Sin asignar",
                debt: totalDebt,
                paid: totalPaid,
                invoiced: totalInvoiced,
                paymentRate: totalInvoiced > 0 ? (totalPaid / totalInvoiced * 100) : 0
            };
        });

        return debtPerUnit.sort((a, b) => b.debt - a.debt);
    }, [allBuildingCharges, floorsWithUnits, selectedBuildingId]);

    const tabs = [
        { id: "general", label: "General" },
        { id: "buildings", label: "Edificios" },
        { id: "residents", label: "Residentes" }
    ];

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Reportes Financieros</h1>
                    <p className="page-subtitle">Análisis de desempeño y evolución</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "2rem", borderBottom: "1px solid var(--color-gray-200)", marginBottom: "2rem" }}>
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                padding: "1rem 0.5rem",
                                border: "none",
                                background: "none",
                                fontWeight: active ? 600 : 500,
                                color: active ? "var(--color-primary)" : "var(--color-gray-500)",
                                borderBottom: active ? "3px solid var(--color-primary)" : "3px solid transparent",
                                cursor: "pointer",
                                transition: "var(--transition)",
                                fontSize: "0.9375rem"
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === "general" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    {/* General KPI Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                        <div className="card" style={{ padding: "1.5rem" }}>
                            <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Recaudación Total (Cartera)</p>
                            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-success)" }}>
                                {formatCLP(allSummaries?.reduce((sum, s) => sum + s.paid_amount, 0) || 0)}
                            </h2>
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-400)", marginTop: "0.5rem" }}>Histórico consolidado</p>
                        </div>
                        <div className="card" style={{ padding: "1.5rem" }}>
                            <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Tasa de Pago Global</p>
                            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-primary)" }}>
                                {allSummaries?.length ?
                                    (allSummaries.reduce((sum, s) => sum + s.paid_count, 0) /
                                        allSummaries.reduce((sum, s) => sum + s.total_count, 1) * 100).toFixed(1) : 0}%
                            </h2>
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-400)", marginTop: "0.5rem" }}>Promedio ponderado</p>
                        </div>
                        <div className="card" style={{ padding: "1.5rem" }}>
                            <p style={{ color: "var(--color-gray-500)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Edificios Administrados</p>
                            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-gray-800)" }}>
                                {buildings?.length || 0}
                            </h2>
                            <p style={{ fontSize: "0.75rem", color: "var(--color-gray-400)", marginTop: "0.5rem" }}>Activos en plataforma</p>
                        </div>
                    </div>

                    {/* General Evolution Chart */}
                    <div className="card" style={{ minHeight: "450px", display: "flex", flexDirection: "column" }}>
                        <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                            Evolución de Cobros vs. Recaudación (Global)
                        </h3>
                        <div style={{ flex: 1, width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={(() => {
                                        const periods = Array.from(new Set(allSummaries?.map(s => s.period) || [])).sort();
                                        // Take last 8 periods for generic overview
                                        const recentPeriods = periods.slice(-8);
                                        return recentPeriods.map(p => {
                                            const subs = allSummaries?.filter(s => s.period === p) || [];
                                            const total = subs.reduce((sum, s) => sum + s.total_amount, 0);
                                            const paid = subs.reduce((sum, s) => sum + s.paid_amount, 0);
                                            return {
                                                name: getMonthLabel(p),
                                                total,
                                                paid,
                                                rate: total > 0 ? (paid / total * 100) : 0
                                            };
                                        });
                                    })()}
                                    margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-gray-100)" />
                                    <XAxis dataKey="name" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis yAxisId="left" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000000}M`} />
                                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: "var(--radius-md)", border: "none", boxShadow: "var(--shadow-lg)" }}
                                        formatter={(v: any, name: string) => {
                                            if (name === "total") return [formatCLP(v), "Total Emitido"];
                                            if (name === "paid") return [formatCLP(v), "Total Recaudado"];
                                            return [`${v.toFixed(1)}%`, "Efectividad"];
                                        }}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Area yAxisId="left" type="monotone" dataKey="total" name="total" fill="var(--color-gray-500)" fillOpacity={0.05} stroke="var(--color-gray-400)" strokeDasharray="5 5" />
                                    <Bar yAxisId="left" dataKey="paid" name="paid" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                                    <Line yAxisId="right" type="monotone" dataKey="rate" name="rate" stroke="var(--color-success)" strokeWidth={3} dot={{ r: 4 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {(activeTab === "buildings" || activeTab === "residents") && (
                <div className="form-group" style={{ maxWidth: "320px", marginBottom: "2.5rem" }}>
                    <label className="form-label">Filtrar por Edificio</label>
                    <select
                        className="form-input"
                        value={selectedBuildingId}
                        onChange={e => setSelectedBuildingId(e.target.value)}
                        style={{ width: "100%" }}
                    >
                        <option value="">Seleccione un edificio...</option>
                        {buildings?.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {activeTab === "residents" && (
                <div>
                    {!selectedBuildingId ? (
                        <div className="card" style={{ textAlign: "center", padding: "6rem 2rem", background: "var(--color-white)", border: "1px dashed var(--color-gray-300)" }}>
                            <p style={{ color: "var(--color-gray-500)", fontSize: "1rem" }}>Seleccione un edificio para ver el comportamiento de deuda por unidad.</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                            {/* Top 10 Debtors Bar Chart */}
                            <div className="card" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                                <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                                    Top 10 Unidades con Mayor Deuda Cumulativa
                                </h3>
                                <div style={{ flex: 1, width: "100%" }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            layout="vertical"
                                            data={residentDebtData.slice(0, 10)}
                                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-gray-100)" />
                                            <XAxis type="number" stroke="var(--color-gray-500)" fontSize={12} tickFormatter={v => `$${v / 1000}k`} />
                                            <YAxis dataKey="number" type="category" stroke="var(--color-gray-500)" fontSize={12} width={80} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: "var(--radius-md)", border: "none", boxShadow: "var(--shadow-lg)" }}
                                                formatter={(v: number) => formatCLP(v)}
                                            />
                                            <Bar dataKey="debt" name="Deuda" fill="var(--color-danger)" radius={[0, 4, 4, 0]} barSize={24} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Detailed Residents Table */}
                            <div className="card">
                                <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                                    Detalle de Pagos por Unidad
                                </h3>
                                <div style={{ overflowX: "auto" }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid var(--color-gray-100)", textAlign: "left" }}>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem" }}>Unidad</th>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem" }}>Propietario / Responsable</th>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem", textAlign: "right" }}>Total Facturado</th>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem", textAlign: "right" }}>Total Pagado</th>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem", textAlign: "right" }}>Deuda Actual</th>
                                                <th style={{ padding: "1rem", color: "var(--color-gray-500)", fontWeight: 500, fontSize: "0.875rem", textAlign: "center" }}>% Pago</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {residentDebtData.map(r => (
                                                <tr key={r.id} style={{ borderBottom: "1px solid var(--color-gray-50)", fontSize: "0.9375rem" }}>
                                                    <td style={{ padding: "1rem", fontWeight: 600 }}>{r.number}</td>
                                                    <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>{r.owner}</td>
                                                    <td style={{ padding: "1rem", textAlign: "right", color: "var(--color-gray-400)" }}>{formatCLP(r.invoiced)}</td>
                                                    <td style={{ padding: "1rem", textAlign: "right", color: "var(--color-success)" }}>{formatCLP(r.paid)}</td>
                                                    <td style={{ padding: "1rem", textAlign: "right", fontWeight: 600, color: r.debt > 0 ? "var(--color-danger)" : "var(--color-gray-700)" }}>{formatCLP(r.debt)}</td>
                                                    <td style={{ padding: "1rem", textAlign: "center" }}>
                                                        <div style={{
                                                            padding: "0.25rem 0.5rem", borderRadius: "1rem", fontSize: "0.75rem", fontWeight: 600, display: "inline-block",
                                                            background: r.paymentRate >= 90 ? "rgba(16, 185, 129, 0.1)" : r.paymentRate >= 50 ? "rgba(245, 158, 11, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                                            color: r.paymentRate >= 90 ? "var(--color-success)" : r.paymentRate >= 50 ? "var(--color-warning)" : "var(--color-danger)"
                                                        }}>
                                                            {r.paymentRate.toFixed(0)}%
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "buildings" && (
                <div>
                    {!selectedBuildingId ? (
                        <div className="card" style={{ textAlign: "center", padding: "6rem 2rem", background: "var(--color-white)", border: "1px dashed var(--color-gray-300)" }}>
                            <p style={{ color: "var(--color-gray-500)", fontSize: "1rem" }}>Seleccione un edificio para ver su evolución financiera de los últimos 6 meses.</p>
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "1.5rem" }}>
                                {/* Expenses Chart */}
                                <div className="card" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                                    <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                                        Evolución Mensual de Gastos
                                    </h3>
                                    <div style={{ flex: 1, width: "100%" }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={expensesData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-gray-100)" />
                                                <XAxis dataKey="name" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000}k`} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: "var(--radius-md)", border: "none", boxShadow: "var(--shadow-lg)" }}
                                                    formatter={(v: number) => [formatCLP(v), "Total Gastos"]}
                                                />
                                                <Bar
                                                    dataKey="amount"
                                                    fill="var(--color-primary)"
                                                    radius={[4, 4, 0, 0]}
                                                    maxBarSize={50}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Payment % Chart */}
                                <div className="card" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                                    <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                                        Evolución de Recaudación (Tasa de Pago)
                                    </h3>
                                    <div style={{ flex: 1, width: "100%" }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={paymentData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-gray-100)" />
                                                <XAxis dataKey="name" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis yAxisId="left" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000}k`} />
                                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: "var(--radius-md)", border: "none", boxShadow: "var(--shadow-lg)" }}
                                                    formatter={(v: any, name: string) => {
                                                        if (name === "collected") return [formatCLP(v), "Recaudado (CLP)"];
                                                        return [`${v}%`, "Tasa de Pago"];
                                                    }}
                                                />
                                                <Legend verticalAlign="top" height={36} />
                                                <Bar
                                                    yAxisId="left"
                                                    dataKey="collected"
                                                    name="collected"
                                                    fill="var(--color-gray-200)"
                                                    radius={[4, 4, 0, 0]}
                                                    maxBarSize={50}
                                                />
                                                <Line
                                                    yAxisId="right"
                                                    type="monotone"
                                                    dataKey="percentage"
                                                    name="percentage"
                                                    stroke="var(--color-success)"
                                                    strokeWidth={3}
                                                    dot={{ r: 5, fill: "var(--color-success)", strokeWidth: 2, stroke: "#fff" }}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Cash Balance Chart (Real) */}
                            <div className="card" style={{ minHeight: "400px", display: "flex", flexDirection: "column" }}>
                                <h3 style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "1.5rem", color: "var(--color-gray-700)" }}>
                                    Evolución de Saldo en Caja (Flujo de Caja Real)
                                </h3>
                                <div style={{ flex: 1, width: "100%" }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={cashData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-gray-100)" />
                                            <XAxis dataKey="name" stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="var(--color-gray-500)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `$${v / 1000000}M`} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: "var(--radius-md)", border: "none", boxShadow: "var(--shadow-lg)" }}
                                                formatter={(v: number) => formatCLP(v)}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="balance"
                                                stroke="var(--color-primary)"
                                                fillOpacity={1}
                                                fill="url(#colorCash)"
                                                strokeWidth={3}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
