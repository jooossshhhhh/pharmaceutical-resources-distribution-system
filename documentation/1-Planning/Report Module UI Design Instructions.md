# UI/UX Design Specification & Prompting Guide: PRDS Report Module

> **Purpose:** Use this specification as a direct prompt/briefing document for an AI UI/UX Designer to design the complete frontend user interface for the **Report Feature** of the PRDS application.

---

## 1. System Background & Domain Context

### What is PRDS?
**PRDS (Pharmaceutical Resources Distribution System)** is an enterprise clinical and inventory distribution system developed for the **City Health Office (CHO)** of the **City of Naga, Cebu, Philippines**. 
- The Central Health Office is officially known as the **Vicente Mendiola Center for Health (VMCH)**. *(Note: "VMCH" and "City Health Office" refer to the exact same central health facility).*
- PRDS centralizes the supply chain, tracking pharmaceutical inventories across the central warehouse/in-house pharmacy and distributing supplies to **28 Barangay Health Stations (BHS)**.

### Target User Roles
1. **Pharmacist II (`PHARMA_II`):** System Administrator & Chief Pharmacist. Oversees city-wide inventory, signs off on physical counts, audits distributions, and prepares monthly government/COA compliance reports.
2. **Pharmacist I (`PHARMA_I`):** Operational Pharmacist at CHO. Handles daily walk-in dispensing to patients, fulfills barangay medicine requests, and runs daily dispensing logs.
3. **Barangay Health Worker (`BHW`):** Operates at a specific Barangay Health Center (e.g., Barangay Colon Health Center). Manages local station stock and records daily medicine dispensing to barangay residents.

---

## 2. Core Goal of the Report Module UI

The Report Module must provide **real-time visual intelligence**, **cadence-driven filtering**, and **one-click Excel exporting** matching official government and clinical formats.

### The Two Major Report Streams:

#### Stream 1: Request and Issuance Slip (RIS / Dispensing Report)
- **Primary Operational Highlight:** **Daily Report of Dispensing**.
- **Real-World Purpose:** Tracks exactly what medicines left the pharmacy today, who received them, and the financial value of the dispensed items.
- **Dual Destination Structure (mirrors the official 2-sheet Excel export):**
  1. **Sheet 1 — CHO In-House Pharmacy Dispensing:**
     - Dispensed directly to walk-in patients at the VMCH clinic.
     - Area label is strictly designated as: **`"PHARMACY DISPENSING"`**.
  2. **Sheet 2 — Barangay Health Center Allocations:**
     - Medicines issued to barangays to fulfill approved Medicine Requests.
     - Area label reflects the receiving barangay: e.g., **`"BARANGAY COLON HEALTH CENTER"`**, **`"BARANGAY INAYAGAN HEALTH CENTER"`**, etc.
     - Multiple barangays receiving supplies on the same day are grouped or clearly labeled.
- **Client Form Rules for Export:**
  - **RIS Number:** **Leave blank** on the exported slip (client manually assigns/logs this).
  - **Signatories Block:** **Leave blank** (client performs manual verification, stamp, and courtesy signature).

#### Stream 2: Inventory Report (Physical Count & Stock Balances)
- **Cadence Options:** Daily, Weekly, and Monthly.
  - **Why Daily for CHO?** The client strictly prefers a **Daily automated report** for continuous operational monitoring, because weekly reporting requires manual physical count intervention which causes operational bottlenecks.
  - **Monthly Report Highlight:** The **Monthly Report** is the official statutory highlight (`InventoryForm.xlsx` format) submitted for LGU and DOH inventory auditing.
- **Stock Movement Columns:**
  - **Beginning Balance:** Starting stock on hand as of the 1st of the month (or close of prior month) with Unit Cost and Total Cost.
  - **Additional Stocks:** New procurements, supplier deliveries, and returned stocks received during the month.
  - **Summation:** Total available stock (`Beginning + Additional`).
  - **Less Issuances:** Stock dispensed to patients and issued to barangay health centers.
  - **Transferred to Other Programs:** Stock diverted to special outreach (e.g., Medical Missions, Senior Citizen Programs).
  - **Expired:** Quantity and financial cost of expired/written-off items.
  - **Remaining Balance:** Final ending stock count at month-end (`Summation - Issuances - Transfers - Expired`).
  - **Location Split:** Physical inventory breakdown between the dispensing counter (`PHARMACY`) and storage warehouse (`STOCKROOM`).
- **Client Form Rules for Export:**
  - **Signatories:** **Leave blank** for manual courtesy check and certification.

---

## 3. Mandatory Design System & Color Palette

The UI design **must strictly adhere** to the established PRDS design tokens, typography, and color aesthetics. Do **not** invent arbitrary primary colors.

### A. Color Palette Tokens

| Token Name | Hex Code | Tailwind / Role | Usage in UI |
| :--- | :--- | :--- | :--- |
| **Emerald Primary** | `#00a36c` | `emerald-600` | Primary action buttons, active tab indicators, branding highlights, key icons. |
| **Mint Accent** | `#6be9c2` | `mint-accent` | Subtle glowing gradients, card accent bars, secondary highlights. |
| **Deep Ink** | `#0d1117` | `text-[#0d1117]` | Primary page headings, KPI numbers, high-emphasis text. |
| **Slate Gray** | `#42474e` | `text-[#42474e]` | Secondary text, table headers, subtitles, inactive nav elements. |
| **Muted Slate** | `#64748b` | `text-slate-500` | Micro-copy, timestamps, table column subheaders. |
| **Border Gray** | `#d8dadc` / `#e2e8f0` | `border-[#d8dadc]` | Crisp borders for cards, table dividers, input borders. |
| **Shell Background**| `#f7f6f3` | `bg-[#f7f6f3]` | Main application background (warm neutral clinic tone). |
| **Panel Surface** | `#ffffff` | `bg-white` | White cards, elevated modules, table wrappers. |
| **Subtle Tint** | `#f8f9ff` / `#f5f7fb` | `bg-[#f8f9ff]` | Secondary panel containers, table alternating row hover. |

### B. Status Badges & Pill Styling

- **Healthy / In Stock / Normal:** `bg-emerald-50 text-emerald-700 border border-emerald-200`
- **Area Badge (CHO / Pharmacy Dispensing):** `bg-blue-50 text-blue-700 border border-blue-200`
- **Area Badge (Barangay Health Center):** `bg-purple-50 text-purple-700 border border-purple-200`
- **Watch / Low Stock:** `bg-amber-50 text-amber-700 border border-amber-200`
- **Critical / Expired:** `bg-red-50 text-red-700 border border-red-200`
- **Program / Outreach:** `bg-teal-50 text-teal-700 border border-teal-200`

### C. Typography & UI Density
- **Font Family:** `Inter`, ui-sans-serif, system-ui, -apple-system, sans-serif.
- **Base UI Font Size:** `14.5px` (90.6% scaling).
  > **Crucial Aesthetic Note:** PRDS is a **high-density enterprise clinical tool**. Tables and cards must feel crisp, clean, and compact—never airy or oversized like a consumer landing page.
- **Border Radius:**
  - Cards & Panels: `rounded-xl` (12px)
  - Interactive Buttons & Inputs: `rounded-lg` (8px)
  - Filter Chips & Status Badges: `rounded-full` (9999px)
- **Card Hover Animation:**
  - `transition: transform 0.18s ease, box-shadow 0.18s ease;`
  - On hover: `translate-y-[-2px]`, `box-shadow: 0 10px 25px -10px rgba(13, 17, 23, 0.12)`

---

## 4. Required Layout & UI Components

The proposed UI for the Report Module should be arranged into the following structured sections:

```
+----------------------------------------------------------------------------------------------------------------------+
| [HEADER BAR]                                                                                                         |
| Reports & Distribution Slips                                               [ Facility: Vicente Mendiola Center (CHO) ]|
| Operational dispensing logs and physical inventory count                   [ Date: Today / Oct 2026 ] [ Export Excel v ]|
+----------------------------------------------------------------------------------------------------------------------+
| [4 SUMMARY KPI CARDS]                                                                                                |
| 1. Daily Dispensed Units   | 2. Distinct Medicines Dispensed | 3. Daily Financial Valuation | 4. Inventory Health / MTD |
|    587 Units               |    31 Unique Items             |    ₱18,450.50                |    ₱342,890.00 (Healthy)  |
|    +12% vs yesterday       |    Top: Losartan, Co-Amox      |    Unit cost aggregation     |    Beginning vs Remaining |
+----------------------------------------------------------------------------------------------------------------------+
| [VIEW / TAB SWITCHER]                                                                                                |
| (•) Daily Dispensing (RIS)          ( ) Monthly Inventory Form           ( ) Stock Movement Audit                    |
+----------------------------------------------------------------------------------------------------------------------+
| [TOOLBAR & CONTROLS]                                                                                                 |
| Search: [ Search medicine, brand, batch... ]   Area Filter: [ All Areas | Pharmacy Dispensing | Brgy Colon... ]       |
| Cadence Filter (if Inventory tab): [ Daily | Weekly | Monthly ]                                                      |
+----------------------------------------------------------------------------------------------------------------------+
| [MAIN DATA TABLE - HIGH DENSITY]                                                                                     |
| Item No | Medicine Description         | Brand      | Unit   | Qty  | Unit Cost | Total Cost | Area / Destination    |
|---------|------------------------------|------------|--------|------|-----------|------------|-----------------------|
| 1       | Losartan 50 mg               | EPISARTAN  | TABLET | 120  | ₱3.50     | ₱420.00    | [PHARMACY DISPENSING] |
| 2       | Co-Amoxiclav 625 mg          | RANICLAV   | TABLET | 63   | ₱15.00    | ₱945.00    | [PHARMACY DISPENSING] |
| 3       | Losartan 50 mg               | EPISARTAN  | TABLET | 120  | ₱3.50     | ₱420.00    | [BRGY COLON HEALTH C.]|
+----------------------------------------------------------------------------------------------------------------------+
| [TABLE FOOTER / SUMMARY BAR]                                                                                         |
| Total Items: 31 medicines | Total Quantity: 587 units | Total Valuation: ₱18,450.50           [ Pagination Controls ] |
+----------------------------------------------------------------------------------------------------------------------+
```

### Detailed Component Requirements:

#### 1. Header & Context Bar
- Title: **Reports & Distribution Slips**
- Subtitle: **Vicente Mendiola Center for Health (VMCH) — City Health Office**
- Control Group:
  - **Date Navigator:** Single-date picker with `< Today >` navigation buttons when viewing Daily Dispensing RIS; Month/Year dropdown selector when viewing Monthly Inventory Form.
  - **Facility Filter (for CHO users):** Dropdown to view Central Health Office alone or filter down to any of the 28 Barangay Health Stations.
  - **Export Dropdown Button:** Prominent Emerald green button (`#00a36c`) with an Excel spreadsheet icon and dropdown options:
    - *Export Daily Request & Issuance Slip (.xlsx)*
    - *Export Monthly Inventory Count (.xlsx)*

#### 2. The 4 Summary Metric Cards (KPIs)
As requested by the client, provide high-visibility summary cards at the top of the module:
1. **Total Daily Dispensed Units:** e.g., `587 units` (combining CHO walk-in dispensing and BHW releases for the selected day).
2. **Specific Medicines Dispensed:** e.g., `31 distinct drugs` with sub-tags highlighting the top dispensed medicines (e.g. *Losartan, Co-Amoxiclav, Amlodipine*).
3. **Daily Financial Valuation (Unit Cost x Quantity):** e.g., `₱18,450.50` showing the cumulative monetary value of medical resources dispensed today.
4. **Monthly Valuation & Ending Stock Health:** e.g., `₱342,890.00 total remaining inventory value` across all active batches, with an indicator of low-stock thresholds.

#### 3. Tab Switcher
- **Tab 1: Daily Dispensing RIS (Default View)**
  - Displays the active daily dispensing items.
  - Includes a segmented sub-filter or pill toggle: `All Items`, `CHO Pharmacy Dispensing (In-House)`, and `Barangay Health Stations (Issued via Requests)`.
- **Tab 2: Monthly Inventory Form (Physical Count)**
  - Displays the full multi-column breakdown matching `InventoryForm.xlsx`:
    - Columns: Item No, Description, Unit, Brand, Lot No, Expiry Date, Beginning Balance (Qty/Cost), Additional Stocks (Qty/Cost), Summation (Qty/Cost), Less Issuances (Qty/Cost), Transferred to Programs, Expired, Remaining Balance (Qty/Cost), Location (Pharmacy / Stockroom).
- **Tab 3: Stock Movement Audit**
  - High-level audit log of batch adjustments, transfers, and fulfillments.

#### 4. The Interactive Data Table
- Crisp, compact table rows with sticky headers.
- Badges for `Area`:
  - Blue pill for `"PHARMACY DISPENSING"`.
  - Purple pill for Barangay stations like `"BARANGAY COLON HEALTH CENTER"`.
- Unit Cost and Total Cost columns with currency formatting in Philippine Peso (`₱`).
- Empty state: Clean illustrated placeholder when no dispensing transactions occurred on the selected date.

#### 5. Export Modal / Drawer
- When the user clicks "Export to Excel", a clean confirmation modal appears showing:
  - Selected Report Type (RIS 2-Sheet or Monthly Inventory Form).
  - Selected Reporting Date or Month.
  - Informational Notice: *"In accordance with CHO procedures, Signatories and RIS Numbers are generated blank for manual verification and physical stamping."*
  - Action buttons: "Cancel" (neutral outline) and "Download .xlsx" (emerald green `#00a36c`).

---

## 5. Summary Checklist for the AI UI Designer

When creating mockups, wireframes, or code implementations:
- [ ] **System Branding:** Incorporate PRDS and VMCH (Vicente Mendiola Center for Health / City Health Office of Naga, Cebu).
- [ ] **Primary Accent:** Use `#00a36c` (Emerald) as the dominant accent and `#6be9c2` (Mint) as the highlight.
- [ ] **Backgrounds:** Use warm neutral `#f7f6f3` and panel white `#ffffff`.
- [ ] **Typography:** Clean `Inter` font, 14.5px base scale, compact enterprise density.
- [ ] **Two Streams Visualized:** Seamlessly toggle between Daily Dispensing (RIS) and Monthly Inventory Form.
- [ ] **Two Areas in Daily RIS:** Clearly differentiate `"PHARMACY DISPENSING"` (CHO) from Barangay Health Center names (BHW).
- [ ] **Summary Cards:** Include the 4 cards for Daily Units, Specific Medicines, Financial Valuation, and Monthly Inventory Health.
- [ ] **Blank Signatories & RIS No.:** Ensure the UI and export flows explicitly preserve blank placeholders for manual administrative stamping.
