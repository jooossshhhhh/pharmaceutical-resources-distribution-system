/*
=====================================================
MIGRATION: Walk-In Dispensing Transactions

Purpose:
Extends medicine_dispensing to support grouped,
multi-batch walk-in transactions and voiding.

Changes:
- Adds dispensing_transaction_id so one visit can
  span several medicines AND several inventory
  batches while remaining a single auditable
  transaction.
- Adds void columns (voided_by, voided_at,
  void_reason) so mistaken transactions are
  cancelled with stock restoration instead of
  deleted, preserving the audit trail.
- Adds indexes for history grouping and the monthly
  eligibility check.

Business Rules:
1. All rows of one visit share the same
   dispensing_transaction_id.
2. Voided rows keep their patient_medicine_records
   but no longer count toward the once-per-calendar-
   month eligibility rule.
3. Void restores quantities back to their source
   batches.
=====================================================
*/

alter table public.medicine_dispensing
    add column if not exists dispensing_transaction_id uuid,
    add column if not exists voided_by uuid
        references public.profiles(id)
        on delete restrict,
    add column if not exists voided_at timestamptz,
    add column if not exists void_reason text;

create index if not exists idx_medicine_dispensing_transaction
    on public.medicine_dispensing(dispensing_transaction_id);

create index if not exists idx_medicine_dispensing_patient_date
    on public.medicine_dispensing(patient_id, dispense_date);

create index if not exists idx_patient_medicine_records_patient_date
    on public.patient_medicine_records(patient_id, date_stamp);
