# Expenses Feature Design

## Overview
Replaces the manual single-input "Total Cost" on the Generate Charges screen with a detailed, itemized Expenses table. Administrators can input monthly building expenses (water, light, concierge, etc.), which seamlessly feed into the final charge generation.

## 1. Data Model Changes

### `expenses` Table Update
We will modify the existing `expenses` table to align with the `charges` table structure:
- **[ADD]** `period` (text): To explicitly group expenses by month (e.g., "2025-01"), exactly like `charges`.
- **[MODIFY]** `expense_date` will remain for record-keeping of when the expense occurred, but `period` will dictate which "Gastos Comunes" cluster it belongs to.
- **[MODIFY]** Remove the `category` enum constraint or expand it to include '' (empty) to allow flexible text inputs if they select "Otro". Right now it is strongly typed.

## 2. UI / UX Design

### A. New "Gastos (Expenses)" Section (`/admin/expenses`)
A new dedicated page for managing expenses by period.
- **View**: A filterable table showing expenses grouped by Month/Year.
- **Action - "New Month"**: 
  - Clicking this creates a fresh table pre-populated with 8 empty rows (Value: $0) for typical expenses: Water, Light, Insurance, Concierge, Administrator, Software, Gas, Other.
- **Action - "Copy Previous Month"**: 
  - Specifically duplicates the exact line items (concepts and values) from the selected past month into a new period. (Strict copy: no extra default rows are injected).
- **Editable Table**:
  - Columns: Date (`expense_date`), Concept/Category, Detailed Description, Amount.
  - Inline editing or a quick modal for adding/removing rows.

### B. Generate Charges Integration (`/admin/charges/generate`)
- The "Total Amount" input field will now auto-calculate and pre-fill based on the sum of all expenses logged for that specific `period`.
- **Override Capability**: The administrator can still manually edit this "Total Amount" field if they want to charge a different amount than the exact expenses (e.g., rounding up or adding to a reserve fund). Warning text will appear if the generated total doesn't match the expenses total.

## 3. API & Data Flow
- **GET `/api/expenses/{building_id}?period=YYYY-MM`**: Fetch expenses for a specific month.
- **POST `/api/expenses/bulk`**: Save/update the entire editable table of expenses at once.
- **POST `/api/expenses/copy`**: Backend endpoint to duplicate a previous period's expenses to a new period.

## 4. Work Flow
1. Admin goes to Expenses -> Selects "January 2025".
2. Clicks "Copy from December 2024" or "New Month".
3. Fills out the itemized costs (Water: $100k, Light: $50k). Total = $150k.
4. Admin goes to Generate Charges -> Selects "January 2025".
5. The system fetches the $150k total and pre-fills the input.
6. Admin clicks "Generate", dividing the $150k among residents by their alícuota.
