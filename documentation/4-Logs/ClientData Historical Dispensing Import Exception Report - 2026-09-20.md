# ClientData Historical Dispensing Import: Withdrawn

Date: 2026-09-21

The proposed July dispensing and August RequestIssuanceSlip historical import was withdrawn because source medicine descriptions and formulations do not consistently match the system catalog. The dispensing-import SQL files were removed from the repository.

Verification against the linked Supabase project found that the import migration was not applied and no dispensing rows carry its import attribution labels. No dispensing, request, patient, or inventory data was inserted or deleted by this withdrawal.

The separate ListOfMedicine catalog import remains in place and is unchanged. The original ClientData workbooks are retained locally as source material and were not modified.
