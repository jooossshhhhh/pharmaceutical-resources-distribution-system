you are aware that we have patients table here in the bhw and cho modules. I don't have yet functionalities for that module. So for the logic of that patients module. It is act like a registration logbook for the system. So here is the flow.

1. For the CHO
 - since the CHO can dispensed the medicine, one requirement they are needed is that to verify that the patient is bonafide citizen of City of Naga, Cebu. So, to confirm this, there are two ways of checking.
 Searching the patients to the system if the name exist then it is confirm then.(also take note that the view of the patient of the CHO is wide sight, it means they can view all patients across the whole barangay health centers)

So if ever, the patient doesn't register yet, then the CHO has the authority to register the patient which is to confirm the patient legit address, the patient can show the id or any proof that they are belong to the specific barangay, but for more advance feature, we can have like register the patient and have a confirmation request to the specific barangay if that patient is under of them or is their barangay citizen.

2.  For BHW.

for this part is easier, it only checks if the patient is already or not then if not then it will register them, since it is BHW and more specific then the registration no need CHO intervention.

But take note, for viewing the patients, the BHW can only view their own patients under their centers of course, they cannot view other patients records from the other facilities unlike the CHO.

The purpose of this patients management is to have better tracking of the belonging patients across all facilities.

But also the main purpose, since we have dispense feature, we have a record checking, since there are rules that limitations of dispensing, for fairness of all patients. when we know the patients name and their record of dispense we can have more control if the patient can received  new free medicine if they don't have record from the past few weeks of the months. However, it will be tackled more soon in the dispensing module, for now let's focus on the patients module. 


Lastly, one took, add the other program module please but don't put code, yet, just put "coming soon" same as the dispensing module and other module that are not yet develop (if there is) 







Plan: Patients module + Coming Soon pages

1. Database migration — database/migrations/2026-patient-registration-logbook.sql (new)
Alter patients table:
- Add middle_name text, suffix text, contact_number text, address text (purok/barangay), patient_code text not null (sequential, e.g. PRD-0001)
- Add created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now()
- Add unique constraint on patient_code
- Sequence for patient code: create sequence patient_code_seq start with 1; + trigger or default nextval with formatting? Simplest: create sequence + patient_code text unique populated by a trigger before insert using nextval formatted PRD- || lpad(nextval, 4, '0'). Or compute via max()? Sequence is cleanest, concurrency-safe.
- RLS: add policies for the new columns — existing policies already cover the table (bhw own facility insert/select/update; pharma all). No new policies needed except maybe update on updated_at — no.
- Note: existing RLS file already covers everything.

2. Frontend files
- src/modules/patients/PatientsModule.jsx — wrapper (role-based like TransfersModule): BHW → BhwPatientsModule, else ChoPatientsModule.
- src/modules/patients/BhwPatientsModule.jsx — own-facility patient logbook: search (name/code/address), sort, registration modal, view details modal, edit (optional), export CSV.
- src/modules/patients/ChoPatientsModule.jsx — all patients across facilities: search, facility filter dropdown, registration modal (choose facility — default own? CHO facility? Actually CHO registers for a specific barangay — the patient must belong to a health center; so the modal must include facility selector), view details, edit, export CSV.
- src/modules/patients/PatientsService.js — getPatients (join facility + registeredBy profile), createPatient (RPC or direct insert with facility_id), updatePatient, deletePatient (pharma II), searchPatients.
- src/modules/patients/patientUtils.js + patientUtils.test.mjs — formatPatientCode, formatPatientName (full name with middle/suffix), matchesPatientFilters, findDuplicatePatients (by name + DOB), sortPatients, buildPatientsCsv, validation for registration form.
- Coming soon pages:
  - src/modules/coming-soon/ComingSoonModule.jsx — generic page (icon, "Coming Soon" title, description) used by both routes.
  - Routes: /dispensing and /other-programs → ComingSoonModule (no RoleGuard or all roles).
- src/routes/AppRoutes.jsx — add /patients (PatientsModule), /dispensing + /other-programs (ComingSoonModule).
- src/components/layout/AdminSidebar.jsx — Patients gets path /patients; Dispensing gets path /dispensing; add Other Programs nav item with path /other-programs; sidebar icons for "Dispensing" exists, add "Other Programs" icon (or reuse Forecasting-like icon — need an icon in iconPaths: add "Other Programs").

3. Registration flow (direct)
- Modal with: first name, middle name (optional), last name, suffix (optional), gender, date of birth, contact number (optional), address (purok/barangay), facility (BHW: fixed own facility; CHO: dropdown of HEALTH_CENTER facilities).
- Duplicate guard: while typing the name (or on submit), query existing patients by first+last (+middle); if match found, show warning banner "Patient already registered — check records" with a "View" action (like MedicinesModule duplicate checker pattern).
- Patient code: auto-generated by DB trigger; shown after save? Or generated in UI via... better from DB (sequence). Display code in the table/details.
- On save: insert with facility_id (BHW own; CHO chosen), created_by = profile id.

4. CHO wide view
- Table columns: Patient Code, Full Name, Gender, Age/DOB, Contact, Address, Facility (barangay), Registered date, action view.
- Facility filter dropdown (all HEALTH_CENTER facilities), search box, sort by name/newest.

5. BHW view
- Same minus facility column/filter (own facility only), plus no facility selector in modal.

6. Tests
- patientUtils.test.mjs with node --test (following repo pattern).

7. Verification
- npm test, eslint on new files, vite build.




The user wants a specific layout for the patients module:
- Fit the existing theme (the app's design language: #f8f9ff backgrounds, rounded-xl white cards, border-[#d8dadc], bg-[#eff4ff] hover, #6be9c2 accent, #00a36c green, dark #0d1117 text, etc.)
- Master-detail layout: initially 1 "form" (full-width list table). When a patient is selected, the layout adjusts to 2 columns: left = list, right = details panel. With smooth animations for the transition.

So the layout pattern is a master-detail split with an animated transition:
- Default state: full-width list card.
- Selected state: grid goes to 2 columns (e.g., lg:grid-cols-[1fr_380px] or similar), details panel slides in (animate width/opacity/translate), list narrows.

Implementation approach in React/Tailwind:
- Container div with CSS grid transition: grid transition-all duration-300 toggling grid-cols-[1fr] → lg:grid-cols-[minmax(0,1fr)_360px]. Tailwind can't transition grid-template-columns smoothly by default... Actually CSS transitions on grid-template-columns ARE animatable in modern browsers (it's a discrete→actually grid-template-columns is animatable per spec in modern Chromium/Firefox — yes, grid-template-columns transitions are supported in Chrome 107+, Firefox 60+... Firefox supports? Let me recall: Firefox does support animating grid-template-columns since FF 66 I believe. Safari 16+? Actually Safari supports transitions of grid-template-columns since 16.0. Chrome 107. So modern browsers OK.)
- Alternative safer approach: flexbox with animated width: list takes flex-1, detail panel w-0 opacity-0 overflow-hidden → w-[380px] opacity-100. Width transitions are well supported.
- Another approach: use a wrapper with grid-cols-[1fr_0px] → grid-cols-[1fr_380px] with transition-[grid-template-columns] duration-300 ease-in-out. This is the cleanest and modern browsers support it. Combined with the detail panel having opacity-0/opacity-100 translate-x-4/translate-x-0 for a smoother feel.
- On mobile: the detail panel should overlay/stack (maybe md: breakpoints: below md, the detail shows as overlay or stacked below list). Keep it simple: lg: breakpoint for side-by-side; below that, details render below the list (stacked).

Also a back/close button on the details panel ("Back to list") and clicking another row switches the selected patient (with the details content updating — maybe animate content swap with key change or subtle fade).

Also "make the UI fit the theme but make it more organized" — consistent with existing modules: AdminShell, card styling, search toolbar, StatusBadge-like badges, MetricCards? (patients module could have a small summary strip? The user said "more organized" — maybe keep it focused: toolbar (search + facility filter for CHO + register button), list, details panel. Keep consistent with existing table styling.)

Layout plan:
- BhwPatientsModule.jsx / ChoPatientsModule.jsx share a common PatientRegistry component with props (isCho / facilities list / canDelete etc.)? That reduces duplication — a PatientRegistry.jsx shared component + two thin wrappers. Given the user's focus on layout, a shared PatientList + PatientDetailsPanel + PatientFormModal components in a patientComponents.jsx (pattern: transfers has TransferUi.jsx; inventory has inventoryComponents.jsx). So:
  - PatientsModule.jsx — role wrapper
  - BhwPatientsModule.jsx — loads patients for own facility, renders PatientRegistry with scope="bhw"
  - ChoPatientsModule.jsx — loads all patients + facilities, renders PatientRegistry with scope="cho"
  - PatientRegistry.jsx — the master-detail animated layout, toolbar, register/edit modal orchestration
  - patientComponents.jsx — PatientTable, PatientDetailsPanel, PatientFormModal, EmptyState pieces
  - PatientsService.js, patientUtils.js + tests

Animation details:
- Grid wrapper: transition-[grid-template-columns] duration-500 ease-in-out with conditional classes.
- Detail panel: overflow-hidden inner; panel itself slides: translate-x-6 opacity-0 pointer-events-none → translate-x-0 opacity-100; content fade.
- Add a subtle top accent or the selected row highlight bg-[#eff4ff] / ring.
- When switching patients while open: re-render details with a key={selectedPatient.id} and a small fade-in animation (reuse prds-fade-in if exists — it's used in AdminShell; maybe keyed span).
- Reduced motion: could respect prefers-reduced-motion but that's extra; skip or mention.


