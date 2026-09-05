/*
=====================================================
Backend/Auth Cleanup - 2026-08-30

Purpose:
- Remove unused legacy transfer release RPC exposure.
- Require active profiles for profile/facility helper updates.
- Add FK indexes for high-use PRDS workflow tables.
=====================================================
*/

drop function if exists public.get_stock_transfer_release_batches(uuid);

create or replace function public.get_user_facility()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select facility_id
    from profiles
    where id = get_current_profile_id()
      and status = 'ACTIVE';
$$;

create or replace function public.is_same_facility(
    target_facility uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select target_facility = get_user_facility();
$$;

create or replace function public.update_own_profile_contact(
    p_first_name text,
    p_last_name text,
    p_email text default null,
    p_phone_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_profile public.profiles%rowtype;
    v_auth_email text;
    v_auth_phone text;
    v_auth_phone_digits text;
    v_auth_phone_local text;
    v_next_first_name text := trim(p_first_name);
    v_next_last_name text := trim(p_last_name);
    v_next_email text := nullif(trim(coalesce(p_email, '')), '');
    v_next_phone_number text := nullif(trim(coalesce(p_phone_number, '')), '');
    v_next_phone_digits text;
    v_next_phone_local text;
    v_details text[] := array[]::text[];
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if nullif(v_next_first_name, '') is null then
        raise exception 'First name is required';
    end if;

    if nullif(v_next_last_name, '') is null then
        raise exception 'Last name is required';
    end if;

    select email, phone
    into v_auth_email, v_auth_phone
    from auth.users
    where id = auth.uid();

    v_auth_phone_digits := regexp_replace(coalesce(v_auth_phone, ''), '[^0-9]', '', 'g');
    v_auth_phone_local := case
        when v_auth_phone_digits ~ '^63[0-9]{10}$' then '0' || substring(v_auth_phone_digits from 3)
        when v_auth_phone_digits ~ '^09[0-9]{9}$' then v_auth_phone_digits
        else null
    end;

    v_next_phone_digits := regexp_replace(coalesce(v_next_phone_number, ''), '[^0-9]', '', 'g');
    v_next_phone_local := case
        when v_next_phone_digits = '' then null
        when v_next_phone_digits ~ '^63[0-9]{10}$' then '0' || substring(v_next_phone_digits from 3)
        when v_next_phone_digits ~ '^09[0-9]{9}$' then v_next_phone_digits
        else null
    end;

    if v_next_phone_number is not null and v_next_phone_local is null then
        raise exception 'Phone number must use 09XXXXXXXXX format';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
    for update;

    if not found then
        raise exception 'An active profile is required to update contact details';
    end if;

    if v_profile.email is distinct from v_next_email then
        if v_next_email is null then
            if v_auth_email is not null then
                raise exception 'Remove Gmail login through Supabase Auth before clearing the profile email';
            end if;
        elsif lower(v_next_email) is distinct from lower(coalesce(v_auth_email, '')) then
            raise exception 'Email updates require a verified Supabase Auth email';
        end if;

        v_details := array_append(
            v_details,
            'Gmail changed from "' || coalesce(v_profile.email, 'Not connected') || '" to "' || coalesce(v_next_email, 'Not connected') || '"'
        );
    end if;

    if coalesce(v_profile.phone_number, '') is distinct from coalesce(v_next_phone_local, '') then
        if v_next_phone_local is null then
            if v_auth_phone_local is not null then
                raise exception 'Remove phone login through Supabase Auth before clearing the profile phone number';
            end if;
        elsif v_next_phone_local is distinct from v_auth_phone_local then
            raise exception 'Phone updates require verified Supabase Auth phone login';
        end if;

        v_details := array_append(
            v_details,
            'Phone number changed from "' || coalesce(v_profile.phone_number, 'Not connected') || '" to "' || coalesce(v_next_phone_local, 'Not connected') || '"'
        );
    end if;

    if v_profile.first_name is distinct from v_next_first_name then
        v_details := array_append(v_details, 'First name changed from "' || coalesce(v_profile.first_name, '') || '" to "' || v_next_first_name || '"');
    end if;

    if v_profile.last_name is distinct from v_next_last_name then
        v_details := array_append(v_details, 'Last name changed from "' || coalesce(v_profile.last_name, '') || '" to "' || v_next_last_name || '"');
    end if;

    update public.profiles
    set
        first_name = v_next_first_name,
        last_name = v_next_last_name,
        email = v_next_email,
        phone_number = v_next_phone_local,
        updated_at = now()
    where id = auth.uid();

    if coalesce(array_length(v_details, 1), 0) > 0 then
        insert into public.activity_logs (user_id, action, module, details)
        values (auth.uid(), 'Profile Updated', 'User Account', array_to_string(v_details, '; '));
    end if;
end;
$$;

revoke all on function public.get_user_facility() from public, anon;
revoke all on function public.is_same_facility(uuid) from public, anon;
revoke all on function public.update_own_profile_contact(text, text, text, text) from public, anon;
grant execute on function public.get_user_facility() to authenticated;
grant execute on function public.is_same_facility(uuid) to authenticated;
grant execute on function public.update_own_profile_contact(text, text, text, text) to authenticated;

create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_forecasting_facility_id on public.forecasting(facility_id);
create index if not exists idx_forecasting_medicine_id on public.forecasting(medicine_id);
create index if not exists idx_inventory_facility_id on public.inventory(facility_id);
create index if not exists idx_inventory_medicine_id on public.inventory(medicine_id);
create index if not exists idx_inventory_supplier_id on public.inventory(supplier_id);
create index if not exists idx_medicine_dispensing_patient_id on public.medicine_dispensing(patient_id);
create index if not exists idx_medicine_dispensing_medicine_id on public.medicine_dispensing(medicine_id);
create index if not exists idx_medicine_dispensing_facility_id on public.medicine_dispensing(facility_id);
create index if not exists idx_medicine_dispensing_dispensed_by on public.medicine_dispensing(dispensed_by);
create index if not exists idx_medicine_dispensing_voided_by on public.medicine_dispensing(voided_by);
create index if not exists idx_medicine_request_items_request_id on public.medicine_request_items(request_id);
create index if not exists idx_medicine_request_items_medicine_id on public.medicine_request_items(medicine_id);
create index if not exists idx_medicine_requests_facility_id on public.medicine_requests(facility_id);
create index if not exists idx_medicine_requests_requested_by on public.medicine_requests(requested_by);
create index if not exists idx_medicine_requests_approved_by on public.medicine_requests(approved_by);
create index if not exists idx_medicine_requests_received_by on public.medicine_requests(received_by);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_patients_facility_id on public.patients(facility_id);
create index if not exists idx_patients_created_by on public.patients(created_by);
create index if not exists idx_patient_medicine_records_patient_id on public.patient_medicine_records(patient_id);
create index if not exists idx_patient_medicine_records_medicine_id on public.patient_medicine_records(medicine_id);
create index if not exists idx_patient_medicine_records_dispensed_by on public.patient_medicine_records(dispensed_by);
create index if not exists idx_profiles_facility_id on public.profiles(facility_id);
create index if not exists idx_profiles_approved_by on public.profiles(approved_by);
create index if not exists idx_profile_facility_change_requests_profile_id on public.profile_facility_change_requests(profile_id);
create index if not exists idx_profile_facility_change_requests_current_facility_id on public.profile_facility_change_requests(current_facility_id);
create index if not exists idx_profile_facility_change_requests_requested_facility_id on public.profile_facility_change_requests(requested_facility_id);
create index if not exists idx_profile_facility_change_requests_reviewed_by on public.profile_facility_change_requests(reviewed_by);
create index if not exists idx_program_medicines_program_id on public.program_medicines(program_id);
create index if not exists idx_program_medicines_medicine_id on public.program_medicines(medicine_id);
create index if not exists idx_stock_transfer_items_transfer_id on public.stock_transfer_items(transfer_id);
create index if not exists idx_stock_transfer_items_medicine_id on public.stock_transfer_items(medicine_id);
create index if not exists idx_stock_transfers_source_facility_id on public.stock_transfers(source_facility_id);
create index if not exists idx_stock_transfers_destination_facility_id on public.stock_transfers(destination_facility_id);
create index if not exists idx_stock_transfers_requested_by on public.stock_transfers(requested_by);
create index if not exists idx_stock_transfers_approved_by on public.stock_transfers(approved_by);
create index if not exists idx_stock_transfers_received_by on public.stock_transfers(received_by);
