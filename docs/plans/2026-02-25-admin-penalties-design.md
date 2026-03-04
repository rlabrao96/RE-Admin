# Implementing Admin Penalty Setup & Automation (Ley 21.442)

This document outlines the architecture and implementation design for the new Fines (Multas) & Interest Rates feature, based on Ley 21.442.

## Problem Context
Administrators need to set up and apply penalties for late Common Expenses (Gastos Comunes). This includes a monthly interest rate percentage for debts (mora) and specific UTM-based fines for regulation breaches. 

## Proposed Changes

### 1. Database Schema Updates
We will add penalty configuration fields to the `buildings` table, so each building can have its own customized rules. 

**Modifications to `buildings` table:**
- `interest_rate_percent` (float, default 0.0): The monthly interest rate for unpaid charges.
- `grace_period_days` (int, default 10): Days after the start of the period before a charge becomes overdue (Mora).

The fines themselves will be stored as normal charges in the `charges` table, using a special `concept` (e.g., "Multa - Reglas de Copropiedad").

### 2. Phase 1: Admin Parameter Definition (UI & API)
**Backend (`/api/buildings`)**
- Update the building schemas (`BuildingCreate`, `BuildingResponse`, `BuildingUpdate`) to include `interest_rate_percent` and `grace_period_days`.
- Update the building update endpoints to save these values.

**Frontend (`/admin/buildings/[id]/page.tsx` & Settings)**
- Add a "Configuración de Penalizaciones" section in the building settings or dashboard.
- Input: Monthly Interest Rate (%).
- Input: Default Grace Period / Due Date.

**Frontend (Fines Creation Modal)**
- Create a new modal for the Admin to issue a Fine to a specific unit.
- Inputs: Unit, Concept (Reason), UTM Amount.
- **UTM Integration**: Integrate with `mindicador.cl` API (`https://mindicador.cl/api/utm`) to fetch the current UTM value in CLP automatically. Provide an override input, and a link to the SII (`https://www.sii.cl/valores_y_fechas/utm/utmYYYY.htm`).

### 3. Phase 2: Charging Mechanics (Automation Logic)
Instead of a background cron job (which adds unwanted infrastructure overhead), the calculation will be **Dynamic**.

**Backend (`/api/charges/generate`)**
When the Administrator clicks "Generate Charges" for a new month:
1. The system creates the base Common Expense charges (Gasto Común) for the period, as it currently does.
2. **Interest Calculation Step**: The system queries all unpaid (`status = "pending"`) charges from previous periods.
3. For each unpaid charge, if the current date is past the `due_date`, the system calculates the interest.
   - `Monthly Interest = Debt Amount * (Admin Interest Rate / 100)`
4. The system inserts a *new* charge for the current period named "Interés por Mora (Mes Anterior)" with the calculated amount.

### 4. Billing Display Update
**Frontend (`/portal` or `/admin` Views)**
- The newly generated "Interés por Mora" charges and manually triggered "Multa" charges are stored as standard rows in the `charges` table. 
- Because they are distinct rows, they will automatically appear as separate line items in the "Aviso de Cobro" and resident payment portal. No major UI overhauls are needed here, just ensuring the breakdown is visible.

## Verification Plan

### Automated Tests
- Test calculation logic in Python to verify `Debt * Rate` math is exact and handles rounding properly.

### Manual Verification
- Go to Admin Portal -> Building Settings: Verify we can save a `1.5`% interest rate.
- Go to Admin Portal -> Create Charge: Verify the "Multa (UTM)" modal correctly fetches the UTM from `mindicador.cl` and converts it to CLP.
- Go to Admin Portal -> Generate Charges: Generate charges for Month 1. Leave them unpaid. Generate charges for Month 2. Verify that Month 2 includes a new line item for the 1.5% interest on Month 1's debt.
