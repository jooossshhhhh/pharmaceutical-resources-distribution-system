/*
=====================================================
2026 Request Receipt Confirmation

Purpose:
Lets the BHW who submitted an approved medicine
request confirm that the supplies were actually
received. Adds receipt metadata to medicine_requests
and provides a security-definer RPC so the BHW can
mark their own facility's approved requests as
COMPLETED.

Dependencies:
- profiles
- facilities
- medicine_requests
- activity_logs
- notifications
- medicine_reqeuests_rls_schema.sql
- helper_functions_schema.sql (is_bhw / is_pharma_i / is_pharma_ii)

Deployment Order:
Run AFTER all schema, helper function, and RLS files
are applied. Safe to run multiple times.
====================================================
*/

-- =====================================================
-- 1. RECEIPT COLUMNS
-- =====================================================

alter table public.medicine_requests
    add column if not exists received_by uuid
        references public.profiles(id)
        on delete set null;

alter table public.medicine_requests
    add column if not exists received_at timestamptz;

/*
====================================================
2. confirm_request_received(request_id)

Security:
- security definer so the function can update the
  row without direct UPDATE RLS for the BHW.
- validates the caller is assigned to the same
  facility as the request.
- only APPROVED requests can be completed.

Returns:
- the updated id, status, received_by, received_at
====================================================
*/
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
