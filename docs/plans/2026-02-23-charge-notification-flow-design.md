# Design: Charge Summary and Notification Flow

This design introduces a "pre-flight" review step after bulk generating charges, allowing administrators to verify the distribution and notify residents via email.

## 1. Objectives
- Show a summary of generated charges immediately after creation.
- Include unit details, resident names, emails, amounts, and alícuota percentages.
- Provide a "Notify" action that triggers a mock email simulation.

## 2. Technical Architecture

### UI Flow (Frontend)
- **Inline Switch**: Upon successful POST to `/api/charges/generate`, the generation form state is cleared and replaced by a `<ChargeSummaryTable>` on the same page.
- **Summary Table Component**:
  - Fetches or receives the list of newly created charges.
  - Columns: `Depto`, `Residente`, `Email`, `Alícuota (%)`, `Monto (CLP)`.
  - Header Action: "Notificar a los Residentes" button.
- **Notification Animation**: When clicked, each row updates with a "sending..." spinner or checkmark UI to simulate the email blast.

### Data Layer (Backend)
- **POST `/api/charges/generate` Enrichment**: The endpoint will be updated to return the charges already joined with resident data (names/emails) to avoid extra roundtrips.
- **Mock Notification Endpoint**: A new `POST /api/charges/notify` endpoint will:
  - Accept a list of charge IDs.
  - Log the simulated email content to the backend logs.
  - Simulate a 100ms delay per notification to make the UI animation feel realistic.

## 3. Email Template (Mock)
- **Subject**: Nuevo Gasto Común - [Building Name] - [Period]
- **Body**: *"Hola [Full Name], se ha generado un nuevo cobro. Debes $[Amount] por el concepto [Concept]. El pago vence el [Date]. Puedes revisarlo en: [App Link]"*

## 4. Error Handling
- If a resident has no email/user account, the row will show a warning "No notification possible".
- API failures during notification will mark the specific row with an error icon.

## 5. Testing Plan
- **Verification**: Browser subagent will verify the transition from form to table and the successful "sending" animation.
- **Logs**: Backend logs must confirm the mocked email content is generated correctly.
