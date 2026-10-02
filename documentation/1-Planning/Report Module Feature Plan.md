
# Report Module Feature Plan

## 1. Daily Reports (RIS - Request and Issuance Slip)
- **Basis:** Daily reporting basis.
- **Includes:**
  - Inventory dispensed for the selected day.
  - Specific medicines that were dispensed (generic, brand, dosage, unit of measure).
  - Record of unit cost and total cost of each medicine.
  - Rendered in KPIs and summary cards on the UI dashboard.
- **Excel Export:** Generates official 2-sheet XLSX workbook (`Request_Issuance_Slip_YYYY-MM-DD.xlsx`).

---

## 2. Monthly Reports (CHO Physical Count of Inventories)
- **Basis:** Monthly inventory ledger and reconciliation basis.
- **Includes:**
  - **Beginning Balance:** Physical stock and valuation on Day 1 of the month.
  - **Additional Stocks:** New procurements, supplier deliveries, and barangay returns received during the month.
  - **Summation:** Gross available stock ($\text{Beginning} + \text{Additions}$).
  - **Less Issuances:** Walk-in pharmacy dispensing and barangay consultation distribution.
  - **Transferred to Other Programs:** Stock allocated to special public health campaigns (anti-rabies, deworming, etc.).
  - **Expired:** Expired stock quarantine write-offs.
  - **Remaining Balance:** Net physical count on hand at the end of the month.
- **Detailed Specification:**
  - See full analysis, accounting interpretation, and database mapping in:
    👉 [`CHO Inventory Physical Count Report Plan and Analysis.md`](file:///d:/prds/documentation/1-Planning/CHO%20Inventory%20Physical%20Count%20Report%20Plan%20and%20Analysis.md)




 