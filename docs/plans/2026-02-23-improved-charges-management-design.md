# Design: Improved Charges Management Workflow

## Problem Description
The current charges management interface presents a flat list of individual charges for all buildings and periods. This makes it difficult for administrators to manage "batches" of charges (e.g., all charges for one building in a specific month), perform bulk deletions safely, or update parameters across many units at once.

## Proposed Design

### View Architecture
- **Summary Page (`/admin/charges`)**: 
  - Features a building-level filter.
  - Displays charges grouped by **Building + Period**.
  - Rows will summarize: Building Name, Period (Month Year), Total Amount Distributed, and Payment Status (% Paid).
  - Provides "Modify" and "Delete" actions at the group level.
- **Detail Page (`/admin/charges/detail`)**:
  - Dynamically loads individual unit charges based on `building_id` and `period` query parameters.
  - Includes a "Back" button to return to the summary.
  - Extends the existing table to show detailed unit/resident information.

### Actions Workflow
- **Modify (Bulk)**:
  - **Recalculate**: Allows changing the total base amount. The system will delete pending charges in the group and generate new ones using unit alícuotas.
  - **Update Parameters**: Batch update of non-financial data like "Due Date" or "Concept Name" without affecting amounts.
- **Delete (Bulk)**:
  - **Safety Restriction**: Deletion is only permitted if **zero** payments have been registered for the entire group.
  - **UI**: The delete button will be disabled and show a tooltip explanation if payments exist.

### Technical Implementation

#### Backend (FastAPI + Supabase)
- **New Summary Endpoint**: `GET /api/charges/summary`
  - Returns a list of building-period groups with counts and sums.
- **Bulk Modification**:
  - `PUT /api/charges/bulk-update`: Updates metadata for all charges matching building+period.
  - `POST /api/charges/bulk-recalculate`: Handles the logic of deleting pending charges and re-generating.
- **Bulk Deletion**:
  - `DELETE /api/charges/bulk-delete`: Deletes all charges for a building+period, with a backend check to ensure no payments exist.

#### Frontend (Next.js)
- Update `frontend/src/app/admin/charges/page.tsx` to use the summary view.
- Create `frontend/src/app/admin/charges/detail/page.tsx` for the drill-down view.
- Implement reusable Modal components for Bulk Modify.

## Verification Plan
1. **Automated Tests**: Unit tests for backend safe-delete logic.
2. **Browser Verification**: End-to-end walkthrough of filtering by building, drilling into details, and attempting to delete a period with and without payments.
