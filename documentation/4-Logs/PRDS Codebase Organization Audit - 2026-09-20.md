# PRDS Codebase Organization Audit - 2026-09-20

## Scope

This audit covers the maintained `prds-desktop` application and its database support files. `prds-web` remains a frozen legacy client and was not changed.

## Confirmed Cleanup

The following desktop files had no runtime importers and were removed:

- `src/backend/sync/syncEngine.js`; the application uses `syncManager.js`.
- `src/frontend/views/coming-soon/ComingSoonModule.jsx`.
- `src/frontend/views/dashboard/components/MiniBarChart.jsx`.
- `src/frontend/views/dispensing/PatientHistoryModal.jsx`.
- `src/frontend/views/forecasting/components/ForecastMetricCard.jsx`.
- `src/frontend/views/forecasting/components/InventoryCoveragePanel.jsx`.
- `src/frontend/views/forecasting/components/TopTrendingMedicines.jsx`.
- `src/frontend/views/forecasting/components/charts/ConsumptionTrendChart.jsx`.
- `src/frontend/views/forecasting/components/charts/ForecastComparisonChart.jsx`.
- `src/frontend/views/inventory/components/DemandPanel.jsx`.

The sync test was updated because it previously read the removed legacy sync engine only to verify that no manual SQLite transaction statements existed.

## Retained Areas

- `database/migrations` was retained as historical/reference material.
- `supabase/migrations` remains the executable Supabase CLI migration source.
- `prds-web` was left unchanged.
- Tauri build output and Vite output remain ignored generated artifacts.

## Organization Findings

- Desktop runtime code is organized consistently under `backend`, `frontend`, and `shared`.
- Feature UI belongs under `frontend/views/<feature>`; feature-only components belong under that feature's `components` directory.
- Supabase access is concentrated in backend services and synchronization code.
- Pure logic is concentrated in `shared/utils` and paired with Node test files.
- The desktop migration guide had stale references to `src/sync`, `dexieDb.js`, and `src/modules`; those references are being aligned with the current structure.
- Empty desktop directories for `frontend/styles` and `shared/constants` were removed because no files currently use them.
- `supabase/config.toml` referenced a missing `supabase/seed.sql`; local seed execution is now disabled until a real seed strategy is introduced.

## Follow-up Candidates

These are not part of this cleanup because they are active code or require broader design decisions:

- Split large services such as `inventoryData.js` and `patientsService.js` by responsibility when they are next changed.
- Split large UI modules only when a component has multiple active consumers or a clear ownership boundary.
- Compare duplicate historical migration scripts before any future removal from `database/migrations`.
