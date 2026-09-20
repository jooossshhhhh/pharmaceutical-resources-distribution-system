# ClientData Historical Dispensing Import Exception Report

Date: 2026-09-20

## Source totals

| Batch | Source rows | Source quantity | Handling |
|---|---:|---:|---|
| July Dispensing.xlsx | 155 | 723,386 | July 1-31 dates, Central Health Office |
| RequestIssuanceSlip.xlsx, pharmacy dispensing | 31 | 653 | August 1, Central Health Office |
| RequestIssuanceSlip.xlsx, Barangay Colon sheet | 8 | 403 | August 1, Barangay Colon |

The supplied Colon sheet contains 8 populated item rows (403 units), not 31 rows (653 units). The migration preserves the workbook as supplied and does not invent the missing 23 rows or 250 units.

## Mapping

Medicine names are matched against the existing catalog after trimming, lowercasing, and removing punctuation/spacing. Explicit aliases cover clear spelling, dosage-format, and unit differences such as Tamsolusin/Tamsulosin, Hydroxychloroquine/Hydroxycloroquine, Metochlopramide/Metoclopramide, and source brand-format variants.

Expected result from strict catalog matching plus explicit aliases: July 146 of 155 rows / 711,867 units; August pharmacy 30 of 31 rows / 623 units; August Colon 8 of 8 rows / 403 units. The skipped quantities are reported at migration time and are not reclassified as another medicine.

Rows without an unambiguous catalog medicine are skipped. The migration emits source_qty, mapped_qty, and skipped_rows notices for each batch during application. It does not create catalog records.

Known exception candidates requiring review include medicines absent from the catalog or without a matching formulation (Diclofenac, Donepezil, Fluphenazine, 10 g Fusidic Acid, Losartan 100 mg + HCTZ, Multivitamins with unspecified formulation, Potassium Chloride without strength, and Tobramycin variants). July skips 9 rows / 11,519 units; the pharmacy slip skips 1 row / 30 units; Colon has no skipped rows.

## Safety

All imported rows are HISTORY_ONLY, is_manual_record = true, inventory_id = NULL, and use explicit ClientData import attribution. Stable transaction IDs derived from source batch and line make reruns idempotent, including repeated identical source lines. No inventory, patient, facility, account, medicine, monthly forecast, or live dispensing data is changed.
