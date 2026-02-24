export interface Expense {
    id?: string;
    concept: string;
    amount_clp: number;
    expense_date: string;
    category: string;
    period: string;
}

export const getExpenses = async (token: string, buildingId: string, period: string) => {
    const res = await fetch(`http://localhost:8000/api/expenses/${buildingId}?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
};

export const saveExpenses = async (token: string, buildingId: string, period: string, expenses: Expense[]) => {
    const res = await fetch(`http://localhost:8000/api/expenses/bulk/${buildingId}?period=${period}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(expenses)
    });
    return res.json();
};

export const copyExpenses = async (token: string, buildingId: string, fromPeriod: string, toPeriod: string) => {
    const res = await fetch(`http://localhost:8000/api/expenses/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ building_id: buildingId, from_period: fromPeriod, to_period: toPeriod })
    });
    return res.json();
};
