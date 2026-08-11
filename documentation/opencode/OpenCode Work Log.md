**Pharmaceutical Resources Distribution System (PRDS)**

**OpenCode Work Log**

This document records the development work performed with OpenCode on the PRDS project. All changes were made in the `prds-web` (Vite + React) frontend. No database schema changes were made during this session.

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
