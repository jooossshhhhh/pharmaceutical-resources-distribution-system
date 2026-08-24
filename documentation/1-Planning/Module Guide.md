**PRDS Module Guide**

Pharmaceutical Resources Distribution System (PRDS) — City Health Office (CHO) of Naga, Cebu. This document describes every module's purpose, workflow, user interface, and interpretation rules for staff and developers.

**1. Roles and Access**

| Role      | Label                    | Scope                                              |
| --------- | ------------------------ | -------------------------------------------------- |
| PHARMA_II | Pharmacist II            | Full oversight: users, suppliers, all transfers, forecasting, medicines catalog |
| PHARMA_I  | Pharmacist I             | CHO operations: inventory, requests, medicines, facilities, transfers, forecasting |
| BHW       | Barangay Health Worker   | Facility-scoped: own stock, own requests, own transfers, own patients |

| Module            | Route             | PHARMA_II | PHARMA_I | BHW |
| ----------------- | ----------------- | :-------: | :------: | :-: |
| Dashboard         | `/dashboard`      | ✓ | ✓ | ✓ |
| Dispensing        | `/dispensing`     | ✓ | ✓ | ✓ |
| Patients          | `/patients`       | ✓ | ✓ | ✓ |
| Inventory (CHO)   | `/inventory`      | ✓ | ✓ | — |
| Inventory (BHW)   | `/inventory-bhw`  | — | — | ✓ |
| Requests          | `/requests`       | ✓ | ✓ | ✓ |
| Transfers         | `/transfers`      | ✓ | ✓ | ✓ |
| Facilities        | `/facilities`     | ✓ | ✓ | — |
| Medicines         | `/medicines`      | ✓ | ✓ | — |
| Suppliers         | `/suppliers`      | ✓ | — | — |
| Forecasting       | `/forecasting`    | ✓ | ✓ | ✓ |
| Notifications     | `/notifications`  | ✓ | ✓ | ✓ |
| Activity Logs     | `/activity-logs`  | ✓ | ✓ | ✓ |
| Users             | `/users`          | ✓ | — | — |
| Profile Settings  | `/profile-settings` | ✓ | ✓ | ✓ |
| Other Programs    | `/other-programs` | ✓ | ✓ | — |

**2. Dashboard**

**Purpose**
The dashboard is the landing screen after login. It summarizes the current state of medicine stock, requests, transfers, and expiring inventory. Each role sees a tailored view — BHW sees only their assigned facility; PHARMA_I sees CHO-wide operations; PHARMA_II sees full oversight including pending user approvals.

**Process**
On load, the module queries inventory rows, facility data, request statuses, transfer statuses, and forecast data in parallel. Role-specific configuration determines which stat cards, charts, and labels are shown. Data is refreshed on each navigation to the dashboard.

**How to Use**
- View the stat card row at the top: total medicines catalogued, pending requests, low-stock alerts, active facilities, pending user approvals (PHARMA_II only), completed transfers, and expiring-soon batches.
- Scroll down to see charts: request status distribution, inventory flow, forecast demand bars (per medicine), and a mini facility map with stock-health pins.
- Click any chart or stat card — this is informational only; no actions are taken from the dashboard.
- BHW sees a single-facility view with their own request queue and stock risks.
- PHARMA_I sees CHO operations with a city-wide request queue.
- PHARMA_II sees the full system including pending user registration approvals.

**How to Interpret**
- Stat cards use color-coded tones: emerald for healthy counts, amber for pending, red for critical.
- The facility map pins use stock-health colors: green (Healthy), amber (Warning), orange (Low), red (Critical).
- Forecast demand bars show predicted monthly quantity per medicine — taller bars indicate higher projected consumption.

**Technical Notes**
- Component: `DashboardModule.jsx`, chart components in `dashboard/components/`.
- Utils: `dashboardUtils.js` — `getDashboardRoleConfig()` returns role-specific labels and visibility flags.
- Role config keys: `coverageLabel`, `requestLabel`, `scopeLabel`, `title`, `subtitle`.

**3. Dispensing**

**Purpose**
A point-of-sale-style module for dispensing medicine to patients. CHO staff (PHARMA_I / PHARMA_II) dispense from central stock; BHW staff dispense from their assigned facility's stock. The module handles patient identification, cart management with FEFO (first-expiry-first-out) batch selection, and dispensing confirmation.

**Process**
1. Select an existing patient from the registry, or register a walk-in patient (name + age + sex).
2. Search and add medicines to the cart — the system suggests batches in FEFO order (soonest expiry first).
3. Review cart lines: each line shows the medicine, batch number, expiry date, quantity, and available stock.
4. Confirm dispensing — a Supabase RPC deducts stock from the selected batches, logs the transaction, and creates dispensing records.
5. A receipt summary is shown; the transaction is logged in activity logs and notifications.

**How to Use**
- From the sidebar, click **Dispensing**.
- **Patient step**: Use the search bar to find an existing patient by name or code. If not found, click **Register Walk-In** and fill in the quick form (name, age, sex). Click **Select Patient** to proceed.
- **Cart step**: Click **Add Medicine** to open the medicine search. Type a medicine name; results show available batches sorted by expiry. Click a batch to add it to the cart. Adjust quantity using the input.
- Each cart line shows a batch preview badge: expiry date and available quantity. If a batch is expiring soon, the badge turns amber or red.
- Click **Confirm Dispensing** to finalize. The system deducts stock via RPC and shows a transaction summary.
- Use the **History** tab to view past dispensing transactions. Filter by date, patient, or medicine. Export to CSV if needed.

**How to Interpret**
- Cart line status: green badge = sufficient stock, amber = expiring soon, red = insufficient stock.
- The dispensing summary shows total lines, total units, and the transaction number (short uppercase code).
- BHW dispensing is scoped to their facility's inventory only; CHO dispensing uses central stock.

**Technical Notes**
- Components: `DispensingModule.jsx` (entry), `DispensingWorkbench.jsx` (main UI), `DispensingUi.jsx` (wizard), `PatientInfoPanel.jsx`, `PatientHistoryModal.jsx`.
- Service: `DispensingService.js` — RPC calls for dispensing transactions.
- Utils: `dispensingUtils.js` — `buildFefoPreview()`, `getCartLineError()`, `getCartSummary()`, `getDispensingStepBlocker()`.
- Tests: `dispensingUtils.test.mjs`.
- Role-split: CHO vs BHW views chosen internally by `profile.role` inside `DispensingModule.jsx`.

**4. Patients**

**Purpose**
A registration logbook for tracking patients who receive medicine. Maintains a searchable, sortable registry of patient records with duplicate detection, age calculation, and CSV export.

**Process**
1. Patient records are created during dispensing (walk-in registration) or directly from the Patients module.
2. The registry loads all patients scoped to the user's role: BHW sees only their facility's patients; CHO roles see all.
3. Records are searchable by name, code, or facility; sortable by name (A–Z or Z–A); filterable by facility.

**How to Use**
- From the sidebar, click **Patients**.
- Use the search bar to filter by patient name, code, or facility.
- Click the **Sort** button to toggle alphabetical order (A–Z ↔ Z–A).
- Click any patient row to view full details: name, age, date of birth, sex, facility, registered date.
- To add a new patient, click **Register Patient** and fill in the form fields (required: first name, last name, date of birth, sex).
- The system checks for duplicates (exact match on name + DOB, or name-only match) before saving.
- Click **Export CSV** to download the current filtered list.

**How to Interpret**
- Patient code is a short identifier derived from the patient's UUID prefix.
- Age is calculated from date of birth using the current date; shown as "X years" or "X months" for infants.
- Duplicate warnings show two levels: "Exact match" (same name + DOB) and "Name match" (similar name, different DOB).

**Technical Notes**
- Components: `PatientsModule.jsx` (entry), `PatientRegistry.jsx` (table + filters), `patientComponents.jsx` (shared UI).
- Service: `PatientsService.js`.
- Utils: `patientUtils.js` — `findDuplicatePatients()`, `matchesPatientFilters()`, `sortPatients()`, `buildPatientsCsv()`, `validatePatientForm()`.
- Tests: `patientUtils.test.mjs`.
- Role-split: `PatientsModule.jsx` picks CHO vs BHW view from `profile.role`.

**5. Inventory**

**Purpose**
Manages batch-level medicine stock at each facility. CHO staff add, edit, and view stock batches; BHW staff have a read-only view of their facility's inventory. Each batch tracks medicine, supplier, quantity, threshold, expiry date, and batch number.

**Process**
1. CHO loads all inventory rows for their facility plus consumption data, forecast data, and related stock across facilities.
2. Stock is displayed in a sortable table with search and filter controls.
3. Adding stock: fill in medicine, supplier, batch number, quantity, threshold, dates → submit creates a new inventory batch via RPC.
4. Editing stock: changes medicine-locked fields (quantity, threshold, dates) while preserving request/dispensing history integrity.
5. Viewing stock: shows a details summary, demand panel (consumption trend, days of supply, stock-out date, forecast, pending requests), and related stock at other facilities.

**How to Use**
- From the sidebar, click **Inventory** (CHO) or **Inventory — BHW** (BHW).
- **Table view**: Browse all batches. Use the search bar to filter by medicine name, batch number, or supplier. Use the status filter to show only Healthy, Warning, Low, or Critical stock.
- **Add stock** (CHO only): Click **Add Stock** button. Fill in medicine, supplier, batch number, quantity, minimum threshold, date received, and expiration date. Click **Add to Inventory**.
- **View stock**: Click any row to open the details modal. The top section shows batch info (batch number, supplier, dates). Below is the demand panel with consumption trends, days of supply, and forecast.
- **Edit stock** (CHO only): From the view modal, click **Edit Stock**. The medicine and facility fields are locked. Adjust quantity, threshold, and dates. Click **Save Changes**.
- **BHW view**: Read-only. Click any row to see the same details modal without edit controls.

**How to Interpret**
- Stock health status (badge on each row):
  - **Healthy**: quantity above minimum threshold, not expiring soon.
  - **Warning**: quantity approaching threshold or within expiring-soon window.
  - **Low**: quantity below minimum threshold.
  - **Critical**: quantity is zero or medicine is expired.
- Days of supply: estimated number of days current stock will last based on average daily consumption (ADC).
- Stock-out date: projected date stock reaches zero.
- The demand panel's channel series chart shows dispensing history over time — spikes indicate high-demand periods.

**Technical Notes**
- Entry: `ChoInventoryModule.jsx` (CHO), `BhwInventoryModule.jsx` (BHW).
- Extracted modals: `components/ChoStockModal.jsx`, `components/BhwStockModal.jsx`.
- Extracted panel: `components/DemandPanel.jsx`.
- Utils: `inventoryUtils.js` — `formatNumber()`, `getStockStatus()`, `getMedicineName()`.
- Data hook: `inventoryData.js` — `useInventoryData()` loads stock, consumption, facilities, medicines, suppliers in parallel.
- Demand utils: `demandUtils.js` — `buildChannelSeries()`, `computeDaysOfSupply()`, `computeStockOutDate()`, `forecastSummary()`.
- Tests: `demandUtils.test.mjs`.
- RPC: `update_inventory_batch` for stock mutations.

**6. Requests**

**Purpose**
Handles the medicine request workflow between BHW (requester) and CHO (reviewer). BHW submit requests for medicines their facility needs; CHO reviews, allocates stock using FEFO, and fulfills requests.

**Process**
1. BHW creates a request: selects medicines and quantities. The system validates against CHO available stock and blocks duplicates.
2. CHO reviews pending requests: sees the request summary, selects releasable batches (FEFO order), and approves or rejects.
3. Once approved and allocated, BHW confirms receipt. The request status progresses through: PENDING → APPROVED → ALLOCATED → RECEIVED.
4. Rejected requests are logged with a reason. Cancelled requests are archived.

**How to Use**
- From the sidebar, click **Requests**.
- **BHW view**: See your facility's requests. Click **New Request** to create one. Search for medicines, set quantities. The system shows CHO available stock for each item. Click **Submit Request**.
- **CHO view**: See all incoming requests. Pending requests appear at the top. Click a request to review details. For each item, click **Allocate** to select batches (FEFO-ordered list). Click **Approve** to finalize allocation, or **Reject** with a reason.
- **Tracking**: Click any request to see its tracking steps (status timeline). Use the status tabs to switch between Pending, Approved, and History views.
- **Export**: Click **Export CSV** to download filtered request history.

**How to Interpret**
- Request status badges:
  - **Pending** (amber): awaiting CHO review.
  - **Approved** (emerald): CHO has approved, allocation in progress.
  - **Allocated** (blue): batches assigned, ready for pickup/receipt.
  - **Received** (green): BHW confirmed receipt.
  - **Rejected** (red): CHO rejected with reason.
  - **Cancelled** (neutral): requester cancelled.
- Priority indicator: derived from requested quantity relative to CHO available stock — higher quantity relative to availability = higher priority.
- Fulfillment ratio: shows how much of the requested quantity was actually allocated (may be partial if stock is insufficient).

**Technical Notes**
- Entry: `RequestsModule.jsx` (splits CHO/BHW internally).
- UI: `RequestUi.jsx`.
- Utils: `requestUtils.js` — `buildMedicineOptions()`, `buildFefoPreview()`, `getCartLineError()`, `getCartSummary()`, `matchesRequestFilters()`, `sortRequests()`.
- Tests: `requestUtils.test.mjs`.
- RPCs: `review_medicine_request` (CHO allocation), `get_cho_inventory_medicines` (availability lookup), `confirm_request_received` (BHW receipt).
- Shared: `AuditInboxUi.jsx` components used for filter panels and lists.

**7. Transfers**

**Purpose**
Manages stock transfers between facilities. CHO can initiate transfers directly; BHW can request transfers that require CHO approval. Transfers use source-controlled FEFO batch allocation — stock is deducted from specific batches at the source facility.

**Process**
1. Initiator selects source facility, destination facility, and medicines with quantities.
2. The system validates source availability and blocks duplicates.
3. FEFO batches are allocated from the source facility's inventory (soonest expiry first).
4. Status progression: PENDING → APPROVED → READY_FOR_PICKUP → COMPLETED (or REJECTED at any point before completion).
5. The receiver confirms receipt, completing the transfer and crediting stock at the destination.

**How to Use**
- From the sidebar, click **Transfers**.
- **Create transfer** (CHO): Click **New Transfer**. Select source and destination facilities. Add medicines and quantities. Review the FEFO allocation preview. Click **Submit**.
- **Create transfer** (BHW): Same flow but your facility is locked as the source. The transfer requires CHO approval before allocation.
- **Queue tab**: Shows transfers awaiting your action — pending approvals (CHO), ready-for-pickup (receiver).
- **History tab**: Completed and rejected transfers. Use filters (keyword, source, destination, status, medicine) to narrow results.
- **Tracking**: Click any transfer to see the status timeline with step indicators.
- **Export**: Download filtered transfer history as CSV.

**How to Interpret**
- Transfer status badges:
  - **Pending** (amber): awaiting approval.
  - **Approved** (emerald): CHO approved, batch allocation pending.
  - **Ready for Pickup** (blue): batches allocated from source, awaiting receiver confirmation.
  - **Completed** (green): receiver confirmed receipt, stock transferred.
  - **Rejected** (red): CHO rejected with reason.
  - **Archived** (neutral): old/completed transfers.
- Allocation details: each transfer item shows the specific batches used (batch number, expiry, quantity allocated).
- Source availability: shown as a dropdown grouped by facility and medicine — CHO sees all facilities; BHW sees only their own.

**Technical Notes**
- Entry: `TransfersModule.jsx` (splits CHO/BHW internally).
- UI: `TransfersService.js` (data + RPC calls).
- Utils: `transferUtils.js` — `buildFefoTransferAllocations()`, `matchesTransferFilters()`, `sortTransfers()`, `getSourceAvailabilityOptions()`.
- Tests: `transferUtils.test.mjs`.
- RPCs: `create_cho_stock_transfer`, `submit_bhw_stock_transfer_request`, `approve_stock_transfer`, `reject_stock_transfer`, `allocate_stock_transfer_for_pickup`, `confirm_stock_transfer_received`.
- Shared: `AuditInboxUi.jsx` for status badges and filter panels.

**8. Facilities**

**Purpose**
Manages the 28 barangay health station (BHS) facility records and the central health office (CHO). Displays facility locations on a map, stock health per facility, and detailed facility profiles including inventory, requests, patients, and forecasts.

**Process**
1. Facilities are loaded with their stock-health computed from inventory threshold levels.
2. Stock health is classified per facility: the worst stock status across all batches determines the facility's overall health.
3. The list can be viewed as a searchable card grid or a Leaflet-powered map with pins.
4. Editing a facility updates its profile (name, code, type, address, coordinates).

**How to Use**
- From the sidebar, click **Facilities** (CHO only).
- **List view**: Browse facility cards. Each card shows the facility name, code, type, stock health bar, unit count, request count, patient count, and alert count.
- **Search**: Type in the search bar to filter by facility name, code, address, or stock health.
- **Stock filter**: Use the dropdown to filter by health status — All, Healthy, Warning, Low, Critical.
- **Sort**: Click the sort button to toggle ascending/descending order.
- **Map view**: Click **Map** to switch to the Leaflet map. Pins are color-coded by stock health. Click a pin to see a popup with facility summary.
- **Add facility**: Click **Add Facility** to open the form modal. Fill in name, code, type, address, and coordinates (use the map picker).
- **View details**: Click a facility card or map popup to open the details modal. See stock breakdown, request history, patient count, and forecast coverage.

**How to Interpret**
- Facility stock health bar: green (all stock healthy), amber (some warning), orange (has low stock), red (has critical stock).
- Alert count: sum of CRITICAL + LOW batch counts across the facility's inventory.
- Health percent: proportion of inventory batches at Healthy status.
- The facility map uses Nominatim geocoding for address search and Leaflet for rendering.

**Technical Notes**
- Entry: `FacilitiesModule.jsx`.
- Extracted components: `components/FacilityCard.jsx`, `components/FacilityFormModal.jsx`, `components/FacilityToolbar.jsx`.
- Utils: `facilityUtils.js` — `getHealthMeta()` (maps stock health to colors/labels), `filterFacilities()`, `sortFacilities()`, `buildFacilityView()`.
- Tests: `facilityUtils.test.mjs`.
- Map: Leaflet + react-leaflet with FacilityMap component (shared by dashboard, facilities, and forecasting).

**9. Medicines**

**Purpose**
Maintains the master catalog of medicines available across the system. Each medicine record includes generic name, brand name, unit of measure, dosage, and unit cost. The catalog is referenced by inventory, dispensing, requests, and transfers.

**Process**
1. Medicines are loaded from the `medicines` table and displayed in a searchable, sortable list.
2. Adding a medicine checks for duplicates (exact match: same generic + brand + dosage + unit; name match: same generic name).
3. Editing a medicine updates its metadata. Deleting is not permitted if the medicine has existing inventory or dispensing records.

**How to Use**
- From the sidebar, click **Medicines** (CHO only).
- Browse the medicine list. Use the search bar to filter by generic name, brand, dosage, or unit.
- Click **Add Medicine** to open the form. Fill in: generic name (required), brand name, unit of measure (dropdown of 20 options + custom), dosage, unit cost (PHP).
- If a duplicate generic name is detected, the form shows a warning: "Exact match" (same everything) or "Name match" (same generic, different details).
- Click a medicine row to view or edit details.
- Unit cost is displayed in Philippine Peso (PHP) format.

**How to Interpret**
- Duplicate warnings do not block saving — they are advisory. The system allows multiple entries with the same generic name if brand/dosage/unit differ.
- Unit of measure options: tablet, capsule, caplet, vial, ampule, sachet, bottle, tube, syrup, suspension, drops, cream, ointment, gel, spray, inhaler, patch, suppository, injection, unit. Custom units are also supported.

**Technical Notes**
- Entry: `MedicinesModule.jsx` — single-file module with inline CRUD.
- Utils: inline duplicate detection (`findDuplicateMedicines()`), currency formatting (`formatCurrency()`).
- Table: `medicines` — referenced by `inventory`, `medicine_dispensing`, `medicine_request_items`, `stock_transfer_fulfillments`.

**10. Suppliers**

**Purpose**
Manages the list of pharmaceutical suppliers. Each supplier record includes name, contact number, address, and status (Active / Inactive). Suppliers are linked to inventory batches.

**Process**
1. Suppliers are loaded and displayed with summary stats (total, active, inactive, with-contact).
2. Adding/editing a supplier updates the `suppliers` table. Status defaults to Active.
3. Deleting is not permitted if the supplier has existing inventory batches.

**How to Use**
- From the sidebar, click **Suppliers** (PHARMA_II only).
- Browse the supplier list. Use the search bar to filter by name, contact number, or address.
- Use the status filter to show All, Active, or Inactive suppliers.
- Click **Add Supplier** to open the form. Fill in: supplier name (required), contact number, address, status.
- Click a supplier row to view or edit details.

**How to Interpret**
- Active badge: emerald background. Inactive badge: neutral/slate background.
- Summary row at the top shows total count, active count, inactive count, and count with a contact number on file.

**Technical Notes**
- Entry: `SuppliersModule.jsx` — single-file module with inline CRUD.
- Table: `suppliers` — referenced by `inventory.supplier_id`.

**11. Forecasting**

**Purpose**
Provides demand forecasting and inventory coverage analysis using simple linear regression (SLR). Ranks medicines by projected demand trend and flags medicines at risk of stock-out based on current stock vs. forecasted consumption.

**Process**
1. Historical dispensing data is aggregated by medicine and month.
2. SLR is applied to the monthly series to compute a trend slope (increasing, stable, decreasing) and R² confidence.
3. Inventory coverage is computed: current stock divided by the latest forecasted monthly demand.
4. Risk labels are assigned based on coverage ratio and stock threshold levels.

**How to Use**
- From the sidebar, click **Forecasting**.
- The top section shows summary cards: medicines with increasing demand, medicines at risk of stock-out, average coverage ratio.
- The trend table lists all medicines with: current stock, forecasted next-month demand, trend direction (up/down/stable), R² confidence, and coverage ratio.
- Click a medicine row to expand details: historical consumption chart, forecast comparison chart, and a plain-language interpretation.
- Use the search bar to filter by medicine name.
- The inventory coverage panel shows each medicine's risk level (Good, Watch, At Risk, Critical) based on how many months of stock remain.

**How to Interpret**
- Trend direction: **Increasing** (upward slope — demand growing), **Stable** (flat), **Decreasing** (downward slope).
- R² confidence: 0.0–1.0. Above 0.7 is considered strong evidence; below 0.3 is weak/insufficient.
- Coverage ratio: months of stock remaining. Above 3 months = Good; 1–3 = Watch; below 1 = At Risk; zero or expired = Critical.
- Forecast interpretation strings: plain-language explanations like "Demand is increasing — consider increasing stock levels" or "History is too sparse for reliable forecasting."

**Technical Notes**
- Entry: `ForecastingModule.jsx`.
- Components: `components/ForecastMetricCard.jsx`, `components/MedicineTrendTable.jsx`, `components/InventoryCoveragePanel.jsx`, `components/TopTrendingMedicines.jsx`, `components/charts/ConsumptionTrendChart.jsx`, `components/charts/ForecastComparisonChart.jsx`.
- Utils: `forecastingUtils.js` — `calculateLinearRegression()`, `forecastSLR()`, `buildMonthlyDemandTrend()`, `buildDemandQualitySummary()`, `buildForecastInterpretation()`, `computeSuggestedOrderQuantity()`, `buildInventoryCoverage()`.
- Tests: `forecastingUtils.test.mjs`.

**12. Notifications**

**Purpose**
A notification center that aggregates system-generated alerts: low-stock warnings, request status changes, transfer status changes, facility-related events, and system announcements. Notifications are role-scoped — BHW sees only their facility's notifications; CHO roles see broader scopes.

**Process**
1. Notifications are loaded from the `notifications` table, filtered by the user's role and facility.
2. The notification list is grouped by date (Today, Yesterday, earlier dates).
3. Unread notifications are highlighted; clicking the check icon marks them as read.
4. Chip filters allow quick filtering by category.

**How to Use**
- From the sidebar, click **Notifications**.
- The default view shows all notifications. Click the **Unread** chip to see only unread items.
- Use category chips to filter: Requests, Transfers, Low Stock, Facility, System.
- Use the date filter to narrow by specific date or date range.
- Use the role filter to see notifications from a specific role.
- Click the checkmark icon on any notification to mark it as read.
- Click **Mark All Read** to clear all unread notifications at once.

**How to Interpret**
- Notification categories and their tones:
  - **Low Stock** (red): medicine stock has fallen below threshold.
  - **Request** (amber): request status changed (approved, rejected, received).
  - **Transfer** (blue): transfer status changed.
  - **Facility** (teal): facility-related event.
  - **System** (neutral): general system announcements.
- Read vs. Unread: unread notifications have a bolder background and a dot indicator.

**Technical Notes**
- Entry: `NotificationsModule.jsx`.
- Service: `NotificationService.js` — `getNotificationData()`, `markOwnNotificationsRead()`.
- Utils: `notificationUtils.js` — `getNotificationCategory()`, `matchesNotificationFilters()`, `notificationCategories`, `notificationDateModes`, `notificationReadFilters`.
- Tests: `notificationUtils.test.mjs`.
- Shared: `AuditInboxUi.jsx` components (AuditBadge, AuditChipBar, AuditFilterPanel, AuditTimeline, etc.).

**13. Activity Logs**

**Purpose**
An audit trail that records all significant system actions: stock adjustments, request reviews, transfer completions, user account changes, and facility modifications. Logs are role-scoped — PHARMA_II sees all logs; PHARMA_I sees their own plus BHW logs; BHW sees only their own.

**Process**
1. Activity logs are loaded from the `activity_logs` table with user and facility joins.
2. Logs are filtered by the user's role visibility rules.
3. The list is grouped by date with relative timestamps ("2 hours ago").
4. CSV export includes the current filter state.

**How to Use**
- From the sidebar, click **Activity Logs**.
- Use the search bar to filter by keyword (user name, action description, module name).
- Use the category filter to narrow by module: Inventory, User Account, Facility, Request, Transfer, etc.
- Use the date filter for specific date or date range.
- Use the facility filter to see logs for a specific facility.
- Use the role filter to see logs from a specific role.
- Click **Export CSV** to download the filtered logs.

**How to Interpret**
- Log tone colors by module:
  - **Inventory** (emerald): stock adds, adjustments, dispensing.
  - **User Account** (blue): registration, role changes, deactivation.
  - **Facility** (amber): facility edits, stock health changes.
  - **Default** (slate): requests, transfers, other events.
- Each log entry shows: user name, role, action, module, facility (if applicable), and relative timestamp.

**Technical Notes**
- Entry: `ActivityLogsModule.jsx`.
- Service: `ActivityLogService.js`.
- Utils: `activityLogUtils.js` — `getVisibleActivityLogs()`, `matchesActivityLogFilters()`, `getActivityLogPanelLabel()`, `getAllowedActivityLogRoleFilters()`.
- Tests: `activityLogUtils.test.mjs`.
- Shared: `AuditInboxUi.jsx` and `AuditInboxUtils.js` for UI shell, grouping, and relative time.

**14. Users**

**Purpose**
PHARMA_II-only module for managing user accounts. Handles user creation, role assignment, facility binding, status lifecycle (Pending → Active → Deactivated), and facility change request review.

**Process**
1. Users are loaded with facility and status data.
2. New users are created with a role and facility assignment; status defaults to Pending.
3. Pending users are activated or deactivated by PHARMA_II.
4. Facility change requests (submitted by users via Profile Settings) appear in a separate tab for approval or rejection.

**How to Use**
- From the sidebar, click **Users** (PHARMA_II only).
- **Accounts tab**: Browse all users (excluding yourself). Use search, status filter, and role filter to narrow results.
- **Add User**: Click **Add User**, fill in role, facility, and status. The user's name/email come from their registration.
- **Edit User**: Click a user row, then **Edit**. Change role, facility, or status. Click **Save**.
- **Facility Requests tab**: See pending facility change requests. Click a request to review. Click **Approve** or **Reject**.
- Summary row shows: total users, pending count, active count, deactivated count.

**How to Interpret**
- User status badges:
  - **Pending** (amber): registered but not yet approved.
  - **Active** (emerald): approved and can log in.
  - **Deactivated** (neutral): account disabled.
- Facility change request statuses: Approved (emerald), Rejected (red), Pending (amber), Cancelled (neutral).
- Email display: phone-derived emails (where the local part is just the phone number) are hidden to avoid duplication.

**Technical Notes**
- Entry: `UserManagementModule.jsx`.
- Service: `UserManagementService.js` — `getUserManagementData()`, `updateManagedUser()`, `reviewFacilityChangeRequest()`.
- Utils: `userManagementUtils.js`.
- Tests: `userManagementUtils.test.mjs`.

**15. Profile Settings**

**Purpose**
User account self-management: edit profile details (name, avatar), manage login methods (Google, phone, email+password), change password, sign out other sessions, export personal data, and submit facility transfer requests.

**Process**
1. On load, the module fetches the Supabase Auth user, linked identities (Google, phone, email), and profile data.
2. Profile editing updates the `profiles` table. Phone changes require OTP verification. Password changes require current password verification.
3. Login methods can be linked (add phone, add Google) or removed (if at least one other method remains).
4. Facility change requests are submitted as records in the `facility_change_requests` table, pending PHARMA_II approval.

**How to Use**
- From the sidebar, click **Profile Settings** (or your avatar in the header).
- **Profile section**: View your name, role, facility, and email. Click **Edit** to update name fields. Click the avatar to upload a new image.
- **Login methods section**: See your linked login methods (Gmail, phone, password). Click **Link** to add a new method. Click **Remove** to unlink (only if you have another method).
- **Password section**: Click **Change Password** to open the password modal. Enter current password, then new password.
- **Phone section**: Click **Change Phone** to start the OTP flow. Enter the new number, verify via OTP.
- **Sign out others**: Click **Sign Out Other Sessions** to invalidate all other active sessions.
- **Data export**: Click **Export Data** to download your profile data as JSON.
- **Facility request**: If you need to transfer to a different facility, click **Request Facility Change** and select the target facility. The request goes to PHARMA_II for approval.

**How to Interpret**
- Login method badges: green checkmark = verified, amber = pending verification.
- Phone numbers are masked for display (e.g., 09XX *** XXXX) for privacy.
- Facility change request status: Pending (awaiting PHARMA_II), Approved, Rejected, Cancelled.
- Profile registration completeness is checked on login — incomplete profiles are redirected to registration.

**Technical Notes**
- Entry: `ProfileSettingsModule.jsx`.
- Components: `OtpModal.jsx`, `PasswordModal.jsx`, `ProfileCards.jsx`, `ProfileFields.jsx`, `ProfileIcons.jsx`, `RemoveLoginMethodModal.jsx`.
- Utils: `profileSettingsUtils.js` — `getAuthLinkedPhoneNumber()`, `getGoogleIdentityEmail()`, `maskPhoneNumber()`, `canRemoveLoginMethod()`, `getPhoneChangeState()`.
- Tests: `profileSettingsUtils.test.mjs`.
- Auth service: `AuthService.js` — OTP, password, identity linking.
- Profile service: `ProfileService.js` — avatar upload, facility change requests.

**16. Other Programs**

**Purpose**
A placeholder module for future health programs and program-specific medicines. Currently displays a "coming soon" message.

**How to Use**
- From the sidebar, click **Other Programs** (CHO only).
- Read the message indicating this section is under development.

**Technical Notes**
- Entry: `ComingSoonModule.jsx` — accepts `title` and `description` props.
- Role-guarded: PHARMA_I and PHARMA_II only.
