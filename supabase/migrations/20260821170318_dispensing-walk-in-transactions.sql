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
    on public.patient_medicine_records(patient_id, date_stamp);;
