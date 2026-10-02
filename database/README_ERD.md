# PRDS Database Entity Relationship Diagram (ERD) & Schema Visualizer (Multi-Paper Edition)

## Overview
This directory contains the official **Black & White (Monochrome)** Entity Relationship Diagram (ERD) and interactive Schema Visualizer for the **Pharmaceutical Resources Distribution System (PRDS)** for the City Health Office (CHO) of Naga, Cebu.

---

## What's New in this Edition

1. **Multiple Paper Sizes Supported:**
   - **Tabloid / Ledger (11 × 17 in • 1700 × 1100 pt):** Ultra-spacious layout with 50pt wide channels between table columns, large 13pt font, and zero line collisions.
   - **Long Bond Paper (8.5 × 13 in • 1300 × 850 pt • Philippine Folio):** Standard Philippine government/LGU bond paper dimensions.
   - **A4 Landscape (297 × 210 mm • 1169 × 827 pt):** International standard A4 paper format.
   - **Short Bond Paper (8.5 × 11 in • 1100 × 850 pt • US Letter):** Standard letter size.
   - **A3 Landscape (420 × 297 mm • 1654 × 1169 pt):** Large engineering blueprint sheet.

2. **Line Visibility Controls:**
   - **Show All Lines:** Displays all 40 foreign key relationships with high-contrast orthogonal lines.
   - **Selected Table Only:** Hides all background lines and only shows connections for the table you click/hover. Eliminates visual line clutter completely.
   - **Line Thickness Adjuster:** Toggle between **Normal (1.5px)**, **Bold (2.5px)**, and **Heavy (3.5px)** for maximum line prominence on printouts.

3. **Anti-Clutter Density Mode:**
   - **Full Attributes:** Displays all columns, types, and constraints.
   - **Keys Only (PK & FK):** Shrinks tables down to Table Header + Primary Keys + Foreign Keys. Cuts table height by ~60%, creating massive vertical gaps and zero text clutter.

4. **Organized Sorting & Filtering:**
   - Sort by **System Workflow**, **Table Name (A-Z)**, **Domain Grouping**, or **Column Count**.
   - Filter by specific domain or search by table/column name.

---

## Files

| File | Path | Purpose |
|---|---|---|
| **Interactive Visualizer** | [`erd-visualizer.html`](file:///d:/prds/database/erd-visualizer.html) | Interactive web visualizer with live paper switcher, line controls, and density toggles. |
| **Draw.io Diagram** | [`prds_erd_schema_a4.drawio`](file:///d:/prds/database/prds_erd_schema_a4.drawio) | Native Draw.io file with tabs for Tabloid, Long Bond, A4, and Domain deep-dives. |

---

## How to Print on Different Paper Sizes
1. Open `erd-visualizer.html` in Chrome or Edge.
2. Select your desired paper size from the **Paper:** dropdown (e.g. *Tabloid*, *Long Bond Paper*, or *A4*).
3. Under **Lines:**, select *Bold (2.5px)* or *Heavy (3.5px)* so lines stand out clearly.
4. If you want a clean overview without cluttered text, change **Density:** to *Keys Only*.
5. Click **🖨️ Print Sheet** (or `Ctrl + P`) and select your printer's paper size.
