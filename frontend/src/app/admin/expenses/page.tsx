"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getExpenses, saveExpenses, copyExpenses, Expense } from "@/lib/expenses-api";
import { useBuildings, Building } from "@/hooks/api/useBuildings";
import { useExpenses } from "@/hooks/api/useExpenses";


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getPreviousPeriod(currentPeriod: string) {
    const [y, m] = currentPeriod.split("-").map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM === 0) { prevM = 12; prevY -= 1; }
    return `${prevY}-${prevM.toString().padStart(2, "0")}`;
}

export default function ExpensesPage() {
    const { data: buildings = [] } = useBuildings();

    const [buildingId, setBuildingId] = useState("");
    const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

    const { data: initialExpenses, isLoading: loading, refetch: refetchExpenses } = useExpenses(buildingId, period);

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [saving, setSaving] = useState(false);
    const [copying, setCopying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleMonthChange = (delta: number) => {
        const [year, month] = period.split("-").map(Number);
        const date = new Date(year, month - 1 + delta, 1);
        const newPeriod = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
        setPeriod(newPeriod);
    };

    // Sync initial query data to local state for editing
    useEffect(() => {
        if (initialExpenses) {
            setExpenses(initialExpenses);
        }
    }, [initialExpenses]);

    const fetchExpenses = useCallback(async () => {
        setError(null);
        setSuccess(null);
        refetchExpenses();
    }, [refetchExpenses]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // map clean values
            const cleanExpenses = expenses.filter(e => e.concept.trim() !== "" || e.amount_clp > 0).map(e => ({
                id: e.id,
                concept: e.concept,
                amount_clp: typeof e.amount_clp === 'string' ? parseInt(e.amount_clp || "0", 10) : e.amount_clp,
                expense_date: e.expense_date,
                category: e.category || "Otros",
                period: period
            }));

            await saveExpenses(session.access_token, buildingId, period, cleanExpenses);
            setSuccess("Gastos guardados exitosamente");
            fetchExpenses();
        } catch (err) {
            console.error(err);
            setError("Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    const handleCopyPrevious = async () => {
        setCopying(true); // Use the new copying state
        setError(null);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const prevPeriod = getPreviousPeriod(period);
            const prevData = await getExpenses(session.access_token, buildingId, prevPeriod);

            if (!prevData || prevData.length === 0) {
                setError("El mes anterior no tiene gastos registrados para copiar.");
            } else {
                const copiedRows = prevData.map((exp: Expense) => ({
                    concept: exp.concept,
                    category: exp.category,
                    amount_clp: exp.amount_clp,
                    expense_date: new Date().toISOString().slice(0, 10),
                    period: period
                }));
                setExpenses(copiedRows);
            }
        } catch (err) {
            console.error(err);
            setError("Error al copiar mes anterior");
        } finally {
            setCopying(false);
        }
    };

    const addDefaultRows = () => {
        const defaultConcepts = [
            { concept: "Agua áreas comunes", category: "Servicios Básicos" },
            { concept: "Luz pasillos y áreas comunes", category: "Servicios Básicos" },
            { concept: "Gas calderas", category: "Servicios Básicos" },
            { concept: "Sueldos Conserjería", category: "Remuneraciones" },
            { concept: "Honorarios Administración", category: "Administración" },
            { concept: "Software EdificioApp", category: "Administración" },
            { concept: "Mantención Ascensores", category: "Mantención" },
        ];

        const newRows = defaultConcepts.map(d => ({
            concept: d.concept,
            amount_clp: 0,
            expense_date: new Date().toISOString().slice(0, 10),
            category: d.category,
            period
        }));
        setExpenses([...expenses, ...newRows]);
    };

    const addEmptyRows = (count: number = 1) => {
        const newRows = Array(count).fill(0).map(() => ({
            concept: "",
            amount_clp: 0,
            expense_date: new Date().toISOString().slice(0, 10),
            category: "Otros",
            period
        }));
        setExpenses([...expenses, ...newRows]);
    };

    const clearAllRows = () => {
        if (window.confirm("¿Seguro que deseas vaciar toda la tabla? (Los cambios no se guardarán hasta presionar Guardar)")) {
            setExpenses([]);
        }
    };

    const formatCurrency = (val: number | string) => {
        if (!val) return "";
        const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val;
        if (isNaN(num)) return "";
        return num.toLocaleString('es-CL');
    };

    const handleAmountChange = (index: number, rawValue: string) => {
        const numericValue = parseInt(rawValue.replace(/\D/g, ''), 10);
        updateExpense(index, "amount_clp", isNaN(numericValue) ? 0 : numericValue);
    };

    const updateExpense = (index: number, field: keyof Expense, value: string | number) => {
        const newExpenses = [...expenses];
        newExpenses[index] = { ...newExpenses[index], [field]: value };
        setExpenses(newExpenses);
    };

    const removeRow = (index: number) => {
        const newExpenses = [...expenses];
        newExpenses.splice(index, 1);
        setExpenses(newExpenses);
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Gastos del Edificio</h1>
                    <p className="page-subtitle">Ingreso y desglose de gastos comunes por periodo</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: "2rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div className="form-group">
                        <label className="form-label">Edificio</label>
                        <select className="form-input" value={buildingId} onChange={e => setBuildingId(e.target.value)}>
                            <option value="">Seleccionar edificio...</option>
                            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Periodo</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.5rem", minWidth: "auto", height: "100%" }}
                                onClick={() => handleMonthChange(-1)}
                                title="Mes anterior"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <input
                                className="form-input"
                                type="month"
                                value={period}
                                onChange={e => setPeriod(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button
                                className="btn btn-outline"
                                style={{ padding: "0.5rem", minWidth: "auto", height: "100%" }}
                                onClick={() => handleMonthChange(1)}
                                title="Mes siguiente"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {buildingId && period && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--color-gray-200)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Detalle de Gastos</h2>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            {expenses.length === 0 ? (
                                <>
                                    <button className="btn btn-ghost" onClick={handleCopyPrevious} disabled={loading}>Copiar Mes Anterior</button>
                                    <button className="btn btn-outline" onClick={addDefaultRows}>Cargar Conceptos Base</button>
                                </>
                            ) : (
                                <button className="btn btn-ghost" onClick={clearAllRows} style={{ color: "var(--color-error)" }}>Vaciar Tabla</button>
                            )}
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        </div>
                    </div>

                    {error && <div style={{ padding: "1rem", color: "var(--color-error)", background: "#FEF2F2" }}>⚠️ {error}</div>}
                    {success && <div style={{ padding: "1rem", color: "var(--color-success)", background: "#F0FDF4" }}>✅ {success}</div>}

                    <div style={{ overflowX: "auto", minHeight: "200px" }}>
                        {loading ? (
                            <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>Cargando...</div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Concepto</th>
                                        <th style={{ width: "150px" }}>Categoría</th>
                                        <th style={{ width: "180px" }}>Monto (CLP)</th>
                                        <th style={{ width: "160px" }}>Fecha</th>
                                        <th style={{ width: "80px" }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((exp, idx) => (
                                        <tr key={exp.id || `new-${idx}`}>
                                            <td>
                                                <input
                                                    className="form-input"
                                                    style={{ padding: "0.4rem 0.6rem", height: "auto" }}
                                                    value={exp.concept}
                                                    onChange={e => updateExpense(idx, "concept", e.target.value)}
                                                    placeholder="Ej: Mantención ascensores"
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    className="form-input"
                                                    style={{ padding: "0.4rem 0.6rem", height: "auto" }}
                                                    value={exp.category}
                                                    onChange={e => updateExpense(idx, "category", e.target.value)}
                                                >
                                                    <option value="Servicios Básicos">Servicios Básicos</option>
                                                    <option value="Remuneraciones">Remuneraciones</option>
                                                    <option value="Administración">Administración</option>
                                                    <option value="Mantención">Mantención</option>
                                                    <option value="Reparaciones">Reparaciones</option>
                                                    <option value="Aseo y Limpieza">Aseo y Limpieza</option>
                                                    <option value="Seguros">Seguros</option>
                                                    <option value="Gastos Legales">Gastos Legales</option>
                                                    <option value="Otros">Otros</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    style={{ padding: "0.4rem 0.6rem", height: "auto", textAlign: "right" }}
                                                    value={formatCurrency(exp.amount_clp)}
                                                    onChange={e => handleAmountChange(idx, e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    className="form-input"
                                                    style={{ padding: "0.4rem 0.6rem", height: "auto" }}
                                                    value={exp.expense_date}
                                                    onChange={e => updateExpense(idx, "expense_date", e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => removeRow(idx)}
                                                    style={{ background: "none", border: "none", color: "var(--color-error)", cursor: "pointer", fontSize: "1.2rem", width: "100%" }}
                                                    title="Eliminar fila"
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>TOTAL</td>
                                        <td style={{ textAlign: "right", fontWeight: 700, fontSize: "1.1rem" }}>
                                            ${expenses.reduce((sum, e) => sum + (typeof e.amount_clp === 'string' ? parseInt(e.amount_clp || "0") : e.amount_clp), 0).toLocaleString("es-CL")}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                    <tr>
                                        <td colSpan={5} style={{ borderTop: "none" }}>
                                            <button className="btn btn-ghost" onClick={() => addEmptyRows(1)} style={{ fontSize: "0.875rem" }}>
                                                + Agregar Fila
                                            </button>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
