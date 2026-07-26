/*
=====================================================
Visible Notifications RPC

Purpose:
Returns notification rows the current authenticated profile may view.

Visibility Rules:
1. Users can always view their own notifications.
2. Pharma II can view every notification.
3. Pharma I can view own notifications and facility-related notifications.
4. BHW can view own notifications and facility-related notifications for
   their assigned facility only.

Notes:
- notifications are still stored per user because is_read belongs to the
  recipient row.
- facility-related rows are inferred from notification title/message until a
  dedicated notification scope column is added.
=====================================================
*/

create or replace function public.get_visible_notifications()
returns table (
  id uuid,
  user_id uuid,
  title text,
  message text,
  is_read boolean,
  created_at timestamptz,
  recipient_first_name text,
  recipient_last_name text,
  recipient_email text,
  recipient_phone_number text,
  recipient_role user_role,
  recipient_facility_id uuid,
  facility_name text,
  facility_code text
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select id, role, facility_id, status
    from public.profiles
    where id = auth.uid()
  ), visible_rows as (
    select
      n.id,
      n.user_id,
      n.title,
      n.message,
      n.is_read,
      n.created_at,
      p.first_name as recipient_first_name,
      p.last_name as recipient_last_name,
      p.email as recipient_email,
      p.phone_number as recipient_phone_number,
      p.role as recipient_role,
      p.facility_id as recipient_facility_id,
      f.facility_name,
      f.facility_code,
      cp.id as current_profile_id,
      cp.role as current_role,
      cp.facility_id as current_facility_id,
      lower(coalesce(n.title, '') || ' ' || coalesce(n.message, '')) as searchable_notification
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    left join public.facilities f on f.id = p.facility_id
    cross join current_profile cp
    where cp.status = 'ACTIVE'
  )
  select
    id,
    user_id,
    title,
    message,
    is_read,
    created_at,
    recipient_first_name,
    recipient_last_name,
    recipient_email,
    recipient_phone_number,
    recipient_role,
    recipient_facility_id,
    facility_name,
    facility_code
  from visible_rows
  where
    user_id = current_profile_id
    or current_role = 'PHARMA_II'
    or (
      current_role = 'PHARMA_I'
      and recipient_facility_id is not null
      and (
        searchable_notification like '%stock%'
        or searchable_notification like '%inventory%'
        or searchable_notification like '%request%'
        or searchable_notification like '%transfer%'
        or searchable_notification like '%dispens%'
        or searchable_notification like '%medicine%'
        or searchable_notification like '%expir%'
        or searchable_notification like '%facility%'
      )
    )
    or (
      current_role = 'BHW'
      and recipient_facility_id = current_facility_id
      and recipient_facility_id is not null
      and (
        searchable_notification like '%stock%'
        or searchable_notification like '%inventory%'
        or searchable_notification like '%request%'
        or searchable_notification like '%transfer%'
        or searchable_notification like '%dispens%'
        or searchable_notification like '%medicine%'
        or searchable_notification like '%expir%'
        or searchable_notification like '%facility%'
      )
    )
  order by created_at desc;
$$;

revoke all on function public.get_visible_notifications() from public;
grant execute on function public.get_visible_notifications() to authenticated;
