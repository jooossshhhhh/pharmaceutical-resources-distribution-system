**Pharmaceutical Resources Distribution System (PRDS)**

**PRDS WorkLog**

This document records the development work performed with OpenCode on the PRDS project. Early sessions were confined to the `prds-web` (Vite + React) frontend; later sessions also added database migrations, RLS policies, helper functions, and realtime publications under `database/`.

**MEDICINES MODULE**

**Refactor to a Pure Catalog**

The Medicines module is now a pure catalog / master-data module used for registering supplier medicines at the Central Health Office (CHO). All stock-oriented features that duplicate the Inventory module were removed.

- Removed the stock column, stock 2x2 tiles, and dispensed-demand trend from the table and details panel.
- Removed the metric row (total/critical/low/value cards).
- Removed the stock filter dropdown and its helper logic (aggregates, trend, expiry helpers).
- `loadMedicines` now uses a single query against the `medicines` table (`id, generic_name, brand_name, unit_of_measure, dosage, unit_cost`) ordered by generic name.
- The catalog table now has 4 columns: Medicine, Brand, Dosage, Cost.
- Search was moved inside the Medicine Catalog card (two-row toolbar: header row = title + "Showing X of Y medicines" + Add Medicine; second row = search input).
- Empty-state copy updated to reflect registration ("Register medicines received at the Central Health Office...").

**Role Gating**

The `/medicines` route and sidebar item are restricted to PHARMA_I and PHARMA_II.

- `src/routes/AppRoutes.jsx`: the `/medicines` route is wrapped in `RoleGuard allowedRoles={["PHARMA_I", "PHARMA_II"]}`.
- `src/components/layout/AdminSidebar.jsx`: the Medicines nav item has `roles: ["PHARMA_I", "PHARMA_II"]`.
- `getAllowedNavItems` (in `src/modules/users/userManagementUtils.js`) already supports per-item `roles` arrays.

**Duplicate Registration Checker**

The duplicate checker went through two iterations.

First iteration - live two-tier checker:
- `findDuplicateMedicines` returned exact matches (generic + dosage + unit of measure) and name matches (same generic, different dosage/unit).
- An amber banner appeared live while typing for exact duplicates, with a "View existing" button.
- A sky-blue hint appeared for same-generic matches, plus a reassurance line ("Different dosage / unit — this can still be added.").

Second iteration - overall submit-time checker (current):
- The live checker was removed; the check now runs when the user clicks "Add Medicine".
- Exact match now includes the brand name: a medicine is rejected only when generic name + brand name + unit of measure + dosage all match.
- Brand Name was made a required field (the "Optional" placeholder was removed and validation added: "Brand name is required.").
- On rejection, the modal stays open and shows a red "not success adding" notification: "This medicine is already registered — {generic} / {brand} / {dosage} / {unit}" with a "View existing" button that closes the modal and highlights the existing row.
- If only the generic name matches (not a total match), the add proceeds and a transient sky-blue banner appears above the catalog: "Added {generic}. Note: a medicine with the same generic name already exists — ..." (auto-dismisses after 6 seconds, create mode only).
- The database unique constraint (`medicines_unique_definition` on generic_name, dosage, unit_of_measure) is kept as-is. Because the DB still blocks "same generic + dosage + unit, different brand", unique-violation errors from the database are detected and converted into the same friendly "already registered" notification with a "View existing" action.

**Unit of Measure Dropdown**

- Unit of Measure is now a `<select>` with a 20-option pharmaceutical list (tablet, capsule, caplet, vial, ampule, sachet, bottle, tube, syrup, suspension, drops, cream, ointment, gel, spray, inhaler, patch, suppository, injection, unit).
- An "Other..." option reveals a free-text input for any unit not in the list, with a "Use list" toggle to switch back.
- A saved custom unit opens straight into the custom input in view/edit mode.

**Key Files**

- `prds-web/src/modules/medicines/MedicinesModule.jsx` - all Medicines module UI, checker, and form logic.
- `prds-web/src/routes/AppRoutes.jsx` - route gating.
- `prds-web/src/components/layout/AdminSidebar.jsx` - sidebar roles.
- `database/schema/medicine_constraint_schema.sql` - the medicines unique constraint (unchanged).

**Verification**

- `npm run lint` - passes.
- `npm run build` - passes.
- Dev server returns HTTP 200 on boot.

**INVENTORY MODULE**

The following UI enhancements for the Inventory module have been implemented in `prds-web/src/modules/inventory/InventoryModule.jsx`.

- Metric cards: expanded to 5 cards (Total Items, Critical Stock, Low Stock, Expiring Soon, Est. Total Value), each with a sub-line. Total Items, Critical, Low, and Expiring Soon cards are clickable and toggle the list filter (clicking the active card again clears the filter). Grid layout is 2/3/5 columns for small/medium/xl screens. The Est. Total Value card was later removed by request (along with its summary value and the unused `medicineCount` memo / `CoinIcon`); the metric row now has 4 cards (grid 2/3/4 columns via `lg:grid-cols-3 xl:grid-cols-4`).
- Expiry awareness: new `daysUntilExpiry` and `getExpiryStatus` helpers. The Expiry table cell now shows a color-coded badge (Expired red / Expiring soon amber / OK emerald) plus the date and "in N days" or "N days ago" helper text, using a 30-day window. A new "Expiring Soon" filter pill matches expired or within-30-days items, and the summary tracks expired/expiring counts for the new card.
- Table polish: sortable headers for Medicine, Stock Level, Expiry, and Last Updated (new `inventorySort` state, `handleSort`, `sortedInventory` memo, and `SortArrowIcon`); skeleton rows while loading (`InventoryRowSkeleton`); clicking a row opens the view modal (action buttons stop propagation); improved empty state with an icon, contextual message, and a "Clear filters" button (`clearFilters` resets search + all three filters).

Scope decided with the user: metric cards, expiry awareness, table polish; no Est. Value column and no filter-bar restyle were included; 30-day expiring window; clickable toggling cards. This scope is now fully implemented and verified (lint, build, dev server HTTP 200).

**Round 2 - Role Awareness, Adjust Stock, and UI Cleanup**

Additional Inventory enhancements implemented in `prds-web/src/modules/inventory/InventoryModule.jsx` (all seven items confirmed by the user). No database schema changes; audit logging reuses the existing `activity_logs` table.

- Role-aware UI: new `canManage` flag (`PHARMA_I` / `PHARMA_II` only). BHW users no longer see the Add Stock button, the row "Adjust stock" icon, or the modal "Adjust Stock" button (RLS already blocked their writes; the UI now matches). For BHW, the facility filter defaults to their own `profile.facility_id`.
- Adjust Stock modal (replaces the blanket edit form): one unified modal with an adjustment type (Restock +qty / Consume -qty / Set Level =qty), a quantity field, an optional reason, and an optional "also update minimum threshold" checkbox. Batch, facility, medicine, supplier, and dates are immutable after creation. On save the `inventory` row is updated (`quantity`, optional `threshold`, `updated_at`) and an `activity_logs` row is inserted (action "Stock Restocked / Stock Consumed / Stock Level Set", module "Inventory", `user_id` = profile id, details include medicine, batch, facility, before/after quantity, and reason). The create (Add Stock) flow now also writes a "Stock Added" activity log.
- Declutter: removed the Unit filter dropdown and the Unit table column (unit is folded into the Medicine cell subtitle, e.g. "brand · unit"); pagination slimmed to Prev / Next buttons. The stock status filter pills below the search bar were removed as redundant with the clickable metric cards (which toggle the same Critical / Low / Expiring filters; clicking the active card clears back to All).
- Sticky first column + sticky header: the table is wrapped in a `max-h` scroll container; the header row is sticky on scroll, and the Medicine column is pinned left with a matching hover background.
- Cross-facility lookup: the view modal shows an "Also stocked elsewhere" list (up to 5 rows) of the same medicine at other facilities with quantity and status, so the CHO can spot transfer candidates when a facility is low.
- CSV export: an "Export CSV" button in the Inventory List header downloads the currently sorted/filtered list (Medicine, Brand, Unit, Batch, Facility, Supplier, Quantity, Threshold, Status, Expiration Date, Last Updated).

**Verification (Round 2)**

- `npm run lint` - passes.
- `npm run build` - passes.
- Dev server returns HTTP 200 on boot.

**FACILITIES MODULE - MAP & COORDINATES**

Implemented in `prds-web/src/modules/facilities/FacilitiesModule.jsx` with new supporting files.

- Database migrations (`database/migrations/2026-facilities-coordinates.sql`): adds `latitude numeric(10,7)` and `longitude numeric(10,7)` to the `facilities` table with range CHECK constraints. No backfill for existing rows - only facilities with a pin appear on the map. `2026-facilities-coordinates-cho-naga.sql` backfills CHO-NAGA (East Poblacion, Naga, Cebu).
- List / Map view toggle: the Facilities toolbar now has a List | Map segmented control. Map view renders the shared `FacilityMap` (`src/modules/dashboard/components/FacilityMap.jsx`) with color-coded stock-health pins, stock status legend (click to show/hide tiers), facility search that highlights matches, popups listing low/out-of-stock alerts with a "View details" button, and fullscreen expand.
- Add / Edit Facility form now requires a location: a `LocationPicker` (`src/modules/facilities/LocationPicker.jsx`) with a place search (Nominatim) and click-to-pin on the map. Coordinates are stored on save; the form validates that a location was set.
- Facility details modal gained a static `FacilityMiniMap` (pinned teardrop marker, CARTO light basemap, Naga bounds), and a Coordinates profile line.
- Both maps are constrained to Naga city bounds via `src/utils/nagaMap.js` (`NAGA_CENTER`, `NAGA_BOUNDS`, `clampToNagaBounds`, `isWithinNagaBounds`).
- New `src/modules/facilities/facilityFormat.js` exports `formatFacilityType` and `formatStatus` shared by Facilities and the map.
- Facilities list card and details modal stock-health logic was unified around a shared `getStockStatus` / `getStockPercent` / `getHealthMeta` set.

**DASHBOARD - INTERACTIVE FACILITY MAP**

- New `FacilityMap` component (`src/modules/dashboard/components/FacilityMap.jsx`) powers both the dashboard and the Facilities map view. Features: stock-status color mode (Critical/Low/Watch/Healthy) and a forecast-demand color mode (tiers 1-99 / 100-499 / 500+) toggled from a pill button when demand data exists; toggleable legends with per-tier counts; search box; reset view; fullscreen overlay; popups with per-facility low/out-of-stock item alerts.
- `dashboardUtils.js`: added `buildFacilityStockStatus` (worst-status wins per facility), `buildFacilityDemand` (sum of predicted quantities per facility), `getFacilityStockTone`, `getStockStatus`.
- `ForecastMapPreview.jsx` rewired to render `FacilityMap` with facilities, stock status, inventory alerts, and demand side metrics (Mapped Facilities / Forecasted Demand / Stock Watch Areas).
- `DashboardModule.jsx`: loads facilities with `latitude`/`longitude`, builds `stockStatusByFacility`, `inventoryRows`, and `demandByFacility`, and passes them to the map preview. BHW users only see their own facility.
- `ForecastingModule.jsx`: facilities query now selects coordinates; the module builds the same three props and passes them to its `ForecastMapPreview`.

**Verification (Facilities + Dashboard map)**

- `npm run lint` - passes.
- `npm run build` - passes.
- Dev server returns HTTP 200 on boot.

**MODALS - INPUT FOCUS STABILITY**

Commit `6331876`. `prds-web/src/components/ModalShell.jsx` was reworked to prevent the input focus loss that occurred while typing in modals (the overlay/portal re-mounting on parent re-render was stealing focus). All module modals were migrated onto the shell, and raw `fixed inset-0 bg-black/45` overlays in Requests/Transfers were replaced by the shell's portal-based overlay.

**PROFILE MODULE - OVERHAUL, PHONE LINKING, OTP**

Commit `5dc71e9`. `prds-web/src/modules/profile/ProfileSettingsModule.jsx` was overhauled (803 lines of changes) along with the phone-linking and OTP flows.

- New `src/features/auth/ProfileService.js` (63 lines) extracts profile-update API calls out of the module.
- `OtpModal.jsx` reworked for the phone-linking OTP verification flow; `PasswordModal.jsx` and `RemoveLoginMethodModal.jsx` aligned to the shared modal shell.
- Removed the legacy `ProfileCards.jsx`; `profileSettingsUtils.js` (+ new test suite `profileSettingsUtils.test.mjs`) carries the formatting/validation helpers.
- `LoginPage.jsx`, `RegisterPage.jsx`, and `AuthProvider.jsx` updated for the new flow. The b74257e session later added a pending-change recovery path so an interrupted phone-number link no longer leaves the profile stuck.

**REQUESTS MODULE - BHW FLOW POLISH**

Commit `fe44263`. `BhwRequestsModule.jsx` and `ChoRequestsModule.jsx` flow updates: the "New Request" button and active metric cards now use the emerald accent (active card becomes solid `#00a36c` with white text), and the raw modal overlays were replaced with the shared `ModalShell` overlay.

**ADMIN CHROME - LAYOUT ALIGNMENT**

Commit `a20dabd`. `AdminHeader.jsx`, `AdminSidebar.jsx`, and `AdminShell.jsx` were tightened so module pages share a consistent chrome: sidebar width/collapse behavior, header controls, and module page paddings aligned across Activity Logs, Notifications, and User Management.

**STOCK TRANSFERS MODULE**

Commit `b74257e`. New module distributing stock between CHO and barangay facilities, with a source-controlled workflow: PENDING (requested) -> APPROVED -> READY_FOR_PICKUP (allocated from source batches) -> COMPLETED (received), or REJECTED.

- `TransfersModule.jsx` role-splits to `BhwTransfersModule.jsx` for BHW and `ChoTransfersModule.jsx` otherwise; `/transfers` route added in `AppRoutes.jsx` plus a "Transfer" sidebar item.
- CHO view: transfer queue with action tabs (Active / Pending / Approved / Ready for Pickup / History), New Transfer modal (source facility, requested items with duplicate/availability validation against the source), details modal with a step timeline (`TimelineItem`), approve / allocate-for-pickup / reject actions, and CSV export.
- BHW view: Request Transfer modal (pick a source facility, add medicines, submit) and a Tracking modal showing the step-by-step transfer state (`getTransferTrackingSteps`).
- Shared UI lives in `TransferUi.jsx` (icons, `StatusBadge`, `FilterChip`, `SortToggleButton`, `MetricCard`, `Field`/`Input`/`Select`/`Textarea`, `TransferModal`).
- `TransfersService.js` wraps the new RPCs: `getTransfersData`, `getTransferSourceAvailability`, `getStockTransferAllocationBatches`, `submitBhwStockTransferRequest`, `createChoStockTransfer`, `approveStockTransfer`, `allocateStockTransferForPickup`, `rejectStockTransfer`, `confirmStockTransferReceived`.
- `transferUtils.js` (486 lines, + 358-line `transferUtils.test.mjs`): status lists/labels/tones, transfer-number and date formatting, filters/sort, FEFO batch allocation builder (`buildFefoTransferAllocations`), allocation validation, tracking steps, and CSV builder.
- Database (`database/migrations/2026-stock-transfer-*.sql`): batch-fulfillment RPCs, source-allocation and source-controlled workflow migrations, updated `stock_transfers` / new `stock_transfer_fulfillments` schemas, enums, and realtime publication for transfer progress.

**REQUESTS - BATCH FULFILLMENT + RECEIPT CONFIRMATION**

Commit `b74257e`.

- `RequestsService.js` rewritten around a configurable `buildRequestSelect`; receipt fields (`received_by`/`received_at` + `receiver` profile) are requested with a `PGRST204` fallback so the query keeps working before the migration runs.
- Batch fulfillment: `reviewMedicineRequest` allocates released batches via `buildFefoBatchAllocations`, `getRequestReleaseBatches` lists releasable batches, `getChoInventoryMedicines` supplies CHO availability, and `confirmRequestReceived` marks a request received.
- `requestUtils.js` (+ `requestUtils.test.mjs` update) gained FEFO allocation, allocation validation, low-stock item detection, tracking steps, priority tones, request summary/rating helpers, and CSV export.
- Database: `2026-cho-request-batch-fulfillment.sql` (570 lines), `2026-cho-request-fulfillment-indexes.sql`, `2026-request-receipt-confirmation.sql` (136 lines), and the `medicine_request_fulfillments` schema.

**INVENTORY - RPC-BASED EDITS + CHO/BHW SPLIT**

Commit `b74257e`.

- Inventory edits now route through the `update_inventory_batch` RPC with facility scoping instead of direct table writes; `ChoInventoryModule.jsx` / `BhwInventoryModule.jsx` updated accordingly.
- New `2026-cho-bhw-stock-availability.sql` migration backs the CHO/BHW stock-availability lookup used by both Requests and Transfers; `2026-inventory-features.sql` extended.

**ROLE GATING + APP SHELL HARDENING**

Commit `b74257e`.

- Routes: `/facilities` gated to PHARMA_I/PHARMA_II, `/suppliers` to PHARMA_II, `/medicines` unchanged; sidebar role gating restored (`getAllowedNavItems`).
- New `ErrorBoundary.jsx` wraps the app (`main.jsx`), portal-based modals via `ModalShell.jsx`, and defensive date handling in `dashboardUtils.js` / `demandUtils.js` / `inventoryData.js`.

**Verification (Transfers / Requests / Inventory)**

- `npm run lint` - passes.
- `npm run build` - passes.
- `npm test` - Node `--test` suites pass (`transferUtils`, `requestUtils`, `inventoryUtils`, `profileSettingsUtils`, `userManagementUtils`).
- Dev server returns HTTP 200 on boot.

**PATIENTS MODULE - REGISTRATION LOGBOOK**

A new Patients module turns the `patients` table into a facility registration logbook for both BHW and CHO users.

- Database: `database/migrations/2026-patient-registration-logbook.sql` adds `middle_name`, `suffix`, `contact_number`, `address`, `patient_code` (unique, sequential `PRD-0001` via `patient_code_seq` + before-insert trigger), plus `created_by`, `created_at`, `updated_at`; backfills existing rows and adds a `pharma_staff_insert_patients` RLS policy so CHO staff can register patients at any health center (BHW keeps its own-facility insert policy from Phase 15E).
- `src/modules/patients/PatientsModule.jsx` role-splits to `BhwPatientsModule.jsx` (own-facility only) and `ChoPatientsModule.jsx` (all patients + health-center facility filter), mirroring the Requests/Transfers wrapper pattern.
- `PatientRegistry.jsx` is the shared master-detail layout: a list card that transitions (animated `grid-template-columns`) to a two-column split when a patient is selected, with a sliding details panel, search, facility filter (CHO), sort, register/edit modal, duplicate guard (exact name+DOB match shows a "Patient already registered" blocker), CSV export, and delete (Pharma II only) with confirm.
- Shared UI in `patientComponents.jsx` (icons, `PatientTable` + skeleton, `PatientDetailsPanel`, `PatientFormModal` on `ModalShell`), data access in `PatientsService.js` (full name/DOB/created_by joins + health-center facilities), and `patientUtils.js` (name/code/age formatting, filters, duplicates, sort, CSV, validation) with a 12-case `patientUtils.test.mjs`.
- Coming-soon pages: `ComingSoonModule.jsx` backs the `/dispensing` and `/other-programs` routes; the sidebar now links Patients → `/patients`, Dispensing → `/dispensing`, and adds "Other Programs" → `/other-programs`.

**Verification (Patients)**

- `npm run lint` - passes.
- `npm run build` - passes.
- `npm test` - all 103 Node `--test` cases pass (includes new `patientUtils` suite).
- Dev server returns HTTP 200 on boot.

**DISPENSING MODULE - WALK-IN DISPENSING (POS)**

New point-of-sale style module for walk-in dispensing of free monthly medicine, covering database, service layer, and frontend for both BHW and CHO roles.

**Database** (`database/migrations/`, all applied live and registered in `DATABASE_SETUP_ORDER.md`)

- `2026-dispensing-walk-in-transactions.sql`: adds `medicine_dispensing.dispensing_transaction_id` (uuid) so one claim spans multiple batch rows, plus void audit columns `voided_by` -> profiles, `voided_at`, `void_reason`; indexes `idx_medicine_dispensing_patient_date` and `idx_medicine_dispensing_transaction`.
- `2026-dispensing-walk-in-rpcs.sql`: three SECURITY DEFINER RPCs granted to `authenticated` only.
  - `dispense_walk_in(p_patient_id uuid, p_items jsonb)` returns a jsonb receipt (`transaction_id`, `facility_id`, `patient_id`, `dispensed_at`). Enforces role (BHW / PHARMA_I / PHARMA_II), locks BHW to their own facility, locks the patient row `FOR UPDATE` to serialize double submits, rejects patients who already have an active claim this calendar month (voided claims excluded), allocates quantities FEFO across non-expired batches (`expiration_date > current_date`, ordered by expiration date, date received, id), deducts inventory atomically, writes `WALK_IN` rows sharing one transaction id, logs activity, and notifies pharmacy staff.
  - `get_patient_monthly_claim_status(p_patient_id uuid)` returns `{ claimed_this_month }`.
  - `void_dispensing_transaction(p_transaction_id uuid, p_reason text)` - PHARMA_II only; restores every source batch quantity, stamps the void columns, logs "Dispensing Voided", and notifies staff.
- `2026-dispensing-performance-indexes.sql`: `idx_medicine_dispensing_facility_date (facility_id, dispense_date desc)` for history queries and `idx_medicine_dispensing_inventory_id` for the void restore path.

**Frontend** (`prds-web/src/modules/dispensing/`)

- Role wrappers: `DispensingModule.jsx` splits to `BhwDispensingModule.jsx` (own facility from `profile.facility_id`) and `ChoDispensingModule.jsx` (all health centers). `/dispensing` now renders the module in `AppRoutes.jsx` (ComingSoon placeholder removed).
- `DispensingService.js`: `getWalkInInventory` (non-expired batches joined with medicines/facilities), patient search / claimed-ids / per-patient full-history readers, `registerQuickPatient`, `completeWalkInDispensing`, `voidDispensingTransaction`.
- `dispensingUtils.js`: month-range helpers, medicine-option aggregation, FEFO preview (allocations + shortfall), cart-line validation, TXN labels, day-parts formatting, history grouping by transaction id (legacy single rows fall back to their row id), filters/sort, CSV export, and `getDispensingStepBlocker`.
- `DispensingUi.jsx`: shared icons, eligibility/cancelled/active badges, filter chip, sort toggle, focus-ring constant, initials avatar, form primitives, and `DispensingModal` on the shared `ModalShell` (optional `closeLabel` renders a labelled Close button instead of the icon X).

**Wizard flow (New Dispensing)**

Rebuilt from an early two-panel split + sticky bar into a guided 3-step wizard (approved plan kept at `.agents/plans/dispensing-wizard-rebuild.md`):

- `StepperBar` header: Patient -> Medicines -> Review & Complete; completed steps show mint checks over an animated connector fill, future steps are disabled with tooltip reasons (`aria-current="step"`); focus moves to each step heading on navigation.
- Step 1 "Search Patient": the header row holds the title plus the Register New Patient action; results render as a single-column list (click-to-select row, name opens info peek, facility line, eligibility badge) that stays visible while dispensing - selecting a patient no longer hides the search, and rows keep neutral borders (no mint hover).
- Patient info side panel: clicking a patient slides open a 380px details column beside the list using the Patients-module master-detail choreography (`transition-[grid-template-columns] duration-500 ease-in-out`, fade-in content, graceful fade-out on close). The panel shows identity facts in readable full-width rows (Address / Health Center / Registered span both columns so long text never crops), an eligibility strip with the claimed-this-month warning for the selected patient, and footer actions: History button left, Select this patient / Continue to Medicines right. Closing is available from both the peek toggle and the panel's labelled controls.
- Per-patient history popup (`PatientHistoryModal.jsx`): opened from the panel's History button; expandable transaction cards with batch tables and expiry badges, Newest/Oldest sort toggle, claims/units summary plus Export CSV toolbar, and the inline cancellation form restricted to PHARMA_II ("Cancel Claim" -> required reason -> stock restored + eligibility reopened). Rendered at the workbench root so the side panel never clips it.
- Step 2 builds the claim: medicine catalog cards with unit counts, then claim lines as cards showing FEFO batch chips, an "Expiring soon" badge when any allocated batch is within 30 days, `- n +` quantity steppers capped at available stock with blur-clamped inputs, inline errors, low-stock cues, flash-on-cart updates, and an aria-live running totals strip.
- Step 3 reviews everything inline (patient, dispenser, FEFO table) and completes; the old confirm modal was removed. Success opens the receipt modal, then the wizard resets to step 1.

**Motion & accessibility pass**

- `prds-step-in` entrance animation per wizard step and `prds-flash-once` cart-line highlight, both disabled under `prefers-reduced-motion`; shared `FOCUS_RING` token applied across interactive controls; `tabular-nums` on all numerals.

**Terminology**

- User-facing copy uses "Cancelled Claim" / "Cancellation reason"; database columns and RPCs keep the `void_*` audit names (`voided_at`, `void_dispensing_transaction`). Requests/Transfers keep their pre-delivery "Rejected" status untouched.

**Live RPC verification** (against Supabase)

- Second monthly claim for the same patient rejected.
- Void restored the deducted batch quantity and made the patient eligible again.
- Multi-medicine claim produced one transaction id across both medicines; a 130-unit Losartan line split FEFO across two batches (120 + 10) with exact inventory deductions.
- BHW dispensing for another facility's patient rejected.

**Verification (Dispensing)**

- `npm run lint` - passes (dispensing scope re-checked with `npx eslint src/modules/dispensing` after every UI round).
- `npm test` - all 122 Node `--test` cases pass (`dispensingUtils.test.mjs` covers FEFO preview, option aggregation, cart validation, history grouping/filter/sort, CSV, day-parts, and step blockers).
- `npm run build` - passes.

**PROJECT TOOLING**

- Session plans moved from `.opencode/plans/` to `.agents/plans/` for tidier repo organization (`.opencode/` removed).
- New root `opencode.json` grants the plan agent write access to `.agents/plans/**/*.md` while keeping edits otherwise denied in plan mode; requires an OpenCode restart to take effect.
