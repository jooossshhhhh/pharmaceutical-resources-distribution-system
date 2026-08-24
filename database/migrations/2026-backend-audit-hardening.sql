/*
=====================================================
Backend Audit Hardening - 2026-08-22

Purpose:
- Align live Supabase security with the actual PRDS role model.
- Remove anonymous access from authenticated-only policies and RPCs.
- Keep anonymous registration access limited to active facilities.
- Harden profile contact updates so email/phone only sync from verified
  Supabase Auth identity state.
=====================================================
*/

-- ==========================================
-- RLS policy roles: authenticated-only rules
-- ==========================================

alter policy "pharma_ii_insert_logs" on public.activity_logs to authenticated;

alter policy "bhw_can_view_own_facility" on public.facilities to authenticated;
alter policy "pharma_ii_manage_facilities" on public.facilities to authenticated;
alter policy "pharma_staff_can_view_facilities" on public.facilities to authenticated;

alter policy "bhw_view_own_forecasts" on public.forecasting to authenticated;
alter policy "pharma_staff_manage_forecasts" on public.forecasting to authenticated;
alter policy "pharma_staff_view_forecasts" on public.forecasting to authenticated;

alter policy "bhw_view_own_inventory" on public.inventory to authenticated;
alter policy "pharma_i_insert_inventory" on public.inventory to authenticated;
alter policy "pharma_i_update_inventory" on public.inventory to authenticated;
alter policy "pharma_ii_delete_inventory" on public.inventory to authenticated;
alter policy "pharma_staff_view_inventory" on public.inventory to authenticated;

alter policy "bhw_insert_dispensing" on public.medicine_dispensing to authenticated;
alter policy "bhw_update_dispensing" on public.medicine_dispensing to authenticated;
alter policy "bhw_view_own_dispensing" on public.medicine_dispensing to authenticated;
alter policy "pharma_ii_delete_dispensing" on public.medicine_dispensing to authenticated;
alter policy "pharma_staff_update_dispensing" on public.medicine_dispensing to authenticated;
alter policy "pharma_staff_view_dispensing" on public.medicine_dispensing to authenticated;

alter policy "create_request_items" on public.medicine_request_items to authenticated;
alter policy "delete_request_items" on public.medicine_request_items to authenticated;
alter policy "update_request_items" on public.medicine_request_items to authenticated;
alter policy "view_request_items" on public.medicine_request_items to authenticated;

alter policy "bhw_create_requests" on public.medicine_requests to authenticated;
alter policy "bhw_view_own_facility_requests" on public.medicine_requests to authenticated;
alter policy "pharma_ii_delete_requests" on public.medicine_requests to authenticated;
alter policy "pharma_staff_update_requests" on public.medicine_requests to authenticated;
alter policy "pharma_staff_view_requests" on public.medicine_requests to authenticated;

alter policy "manage_programs" on public.other_programs to authenticated;
alter policy "view_programs" on public.other_programs to authenticated;

alter policy "bhw_insert_patient_records" on public.patient_medicine_records to authenticated;
alter policy "bhw_update_patient_records" on public.patient_medicine_records to authenticated;
alter policy "bhw_view_patient_records" on public.patient_medicine_records to authenticated;
alter policy "pharma_ii_delete_patient_records" on public.patient_medicine_records to authenticated;
alter policy "pharma_staff_update_patient_records" on public.patient_medicine_records to authenticated;
alter policy "pharma_staff_view_patient_records" on public.patient_medicine_records to authenticated;

alter policy "bhw_insert_patients" on public.patients to authenticated;
alter policy "bhw_update_patients" on public.patients to authenticated;
alter policy "bhw_view_own_patients" on public.patients to authenticated;
alter policy "pharma_ii_delete_patients" on public.patients to authenticated;
alter policy "pharma_staff_update_patients" on public.patients to authenticated;
alter policy "pharma_staff_view_patients" on public.patients to authenticated;

alter policy "manage_program_medicines" on public.program_medicines to authenticated;
alter policy "view_program_medicines" on public.program_medicines to authenticated;

alter policy "create_transfer_items" on public.stock_transfer_items to authenticated;
alter policy "delete_transfer_items" on public.stock_transfer_items to authenticated;
alter policy "update_transfer_items" on public.stock_transfer_items to authenticated;
alter policy "view_transfer_items" on public.stock_transfer_items to authenticated;

alter policy "bhw_create_transfer_requests" on public.stock_transfers to authenticated;
alter policy "bhw_view_facility_transfers" on public.stock_transfers to authenticated;
alter policy "pharma_ii_delete_transfers" on public.stock_transfers to authenticated;
alter policy "pharma_staff_update_transfers" on public.stock_transfers to authenticated;
alter policy "pharma_staff_view_transfers" on public.stock_transfers to authenticated;

alter policy "bhw_create_requests" on public.medicine_requests
    with check (
        public.is_bhw()
        and requested_by = (select auth.uid())
        and facility_id = public.get_user_facility()
        and status = 'PENDING'
        and approved_by is null
        and approved_at is null
    );

alter policy "bhw_create_transfer_requests" on public.stock_transfers
    with check (
        public.is_bhw()
        and requested_by = (select auth.uid())
        and destination_facility_id = public.get_user_facility()
        and source_facility_id <> destination_facility_id
        and status = 'PENDING'
        and approved_by is null
        and approved_at is null
        and received_by is null
        and received_at is null
    );


-- ==========================================
-- Function search path and executable grants
-- ==========================================

alter function public.is_same_facility(uuid) set search_path = public;

revoke all on function public.generate_patient_code() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;
revoke all on function public.notify_and_log_facility_change_request() from public, anon, authenticated;
revoke all on function public.sync_google_identity_email() from public, anon, authenticated;

revoke all on function public.get_current_profile_id() from public, anon;
revoke all on function public.get_user_facility() from public, anon;
revoke all on function public.get_visible_notifications() from public, anon;
revoke all on function public.is_bhw() from public, anon;
revoke all on function public.is_pharma_i() from public, anon;
revoke all on function public.is_pharma_ii() from public, anon;
revoke all on function public.is_same_facility(uuid) from public, anon;
revoke all on function public.log_own_password_change() from public, anon;
revoke all on function public.review_profile_facility_change_request(uuid, public.facility_change_request_status) from public, anon;
revoke all on function public.update_own_profile_avatar(text) from public, anon;
revoke all on function public.update_own_profile_contact(text, text, text, text) from public, anon;

grant execute on function public.get_current_profile_id() to authenticated;
grant execute on function public.get_user_facility() to authenticated;
grant execute on function public.get_visible_notifications() to authenticated;
grant execute on function public.is_bhw() to authenticated;
grant execute on function public.is_pharma_i() to authenticated;
grant execute on function public.is_pharma_ii() to authenticated;
grant execute on function public.is_same_facility(uuid) to authenticated;
grant execute on function public.log_own_password_change() to authenticated;
grant execute on function public.review_profile_facility_change_request(uuid, public.facility_change_request_status) to authenticated;
grant execute on function public.update_own_profile_avatar(text) to authenticated;
grant execute on function public.update_own_profile_contact(text, text, text, text) to authenticated;


-- ==========================================
-- Patient and request RPC hardening
-- ==========================================

create or replace function public.get_patient_monthly_claim_status(
    p_patient_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid;
    v_caller_facility uuid;
    v_caller_role public.user_role;
    v_patient_facility uuid;
    v_claimed boolean;
begin
    select p.id, p.facility_id, p.role
      into v_caller_id, v_caller_facility, v_caller_role
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if v_caller_id is null then
        raise exception 'An active account is required to view patient dispensing status.'
            using errcode = '42501';
    end if;

    if v_caller_role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
        raise exception 'Your role cannot view patient dispensing status.'
            using errcode = '42501';
    end if;

    select pt.facility_id
      into v_patient_facility
      from public.patients pt
     where pt.id = p_patient_id;

    if v_patient_facility is null then
        raise exception 'Patient not found.'
            using errcode = 'P0001';
    end if;

    if v_caller_role = 'BHW' and v_patient_facility is distinct from v_caller_facility then
        raise exception 'Barangay health workers can only view dispensing status for patients of their own facility.'
            using errcode = '42501';
    end if;

    select exists (
        select 1
          from public.medicine_dispensing md
         where md.patient_id = p_patient_id
           and md.voided_at is null
           and date_trunc('month', md.dispense_date) = date_trunc('month', now())
    )
    into v_claimed;

    return jsonb_build_object('claimed_this_month', v_claimed);
end;
$$;

revoke all on function public.get_patient_monthly_claim_status(uuid) from public;
revoke all on function public.get_patient_monthly_claim_status(uuid) from anon;
grant execute on function public.get_patient_monthly_claim_status(uuid) to authenticated;

create or replace function public.confirm_request_received(request_id uuid)
returns table (
    id uuid,
    status public.request_status,
    received_by uuid,
    received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_facility uuid;
    request_record public.medicine_requests;
    target_request_id alias for $1;
begin
    select p.facility_id
      into caller_facility
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'BHW'
       and p.status = 'ACTIVE';

    if caller_facility is null then
        raise exception 'An active BHW account assigned to a facility is required.';
    end if;

    select r.*
      into request_record
      from public.medicine_requests r
     where r.id = target_request_id
     for update;

    if request_record.id is null then
        raise exception 'Medicine request not found.';
    end if;

    if request_record.facility_id <> caller_facility then
        raise exception 'You can only confirm receipt for requests from your own facility.';
    end if;

    if request_record.status <> 'APPROVED' then
        raise exception 'Only approved requests can be marked as received.';
    end if;

    return query
        update public.medicine_requests
           set status = 'COMPLETED',
               received_by = auth.uid(),
               received_at = now()
         where medicine_requests.id = target_request_id
           and medicine_requests.status = 'APPROVED'
         returning
               medicine_requests.id,
               medicine_requests.status,
               medicine_requests.received_by,
               medicine_requests.received_at;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        auth.uid(),
        'Request Received',
        'Medicine Request',
        'Confirmed receipt of medicine request ' || target_request_id
    );

    insert into public.notifications (user_id, title, message)
    select
        p.id,
        'Request Received',
        'The medicine request ' || upper(substr(target_request_id::text, 1, 8))
            || ' has been received by ' || (
                select f.facility_name
                  from public.facilities f
                 where f.id = caller_facility
            ) || '.'
      from public.profiles p
     where p.role in ('PHARMA_I', 'PHARMA_II');
end;
$$;

revoke all on function public.confirm_request_received(uuid) from public;
revoke all on function public.confirm_request_received(uuid) from anon;
grant execute on function public.confirm_request_received(uuid) to authenticated;


-- ==========================================
-- Dead compatibility RPC cleanup
-- ==========================================

drop function if exists public.approve_and_release_stock_transfer(uuid, jsonb, text);


-- ==========================================
-- Table privileges: keep RLS, remove broad anon grants
-- ==========================================

revoke all privileges on all tables in schema public from anon;
grant select on public.facilities to anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;


-- ==========================================
-- Profile contact updates
-- ==========================================

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
    for update;

    if not found then
        raise exception 'Profile not found';
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

revoke all on function public.update_own_profile_contact(text, text, text, text) from public, anon;
grant execute on function public.update_own_profile_contact(text, text, text, text) to authenticated;
