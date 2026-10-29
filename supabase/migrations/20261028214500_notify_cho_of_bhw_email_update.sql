-- Migration: Add notify_cho_of_bhw_email_update RPC function
-- When a BHW updates their primary Gmail/email, notify active CHO users (PHARMA_II and PHARMA_I)
-- and record an audit log in activity_logs.

create or replace function public.notify_cho_of_bhw_email_update(
    p_old_email text,
    p_new_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
    v_role user_role;
    v_facility_name text;
    v_user_name text;
    v_cho_user record;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    -- Ensure profiles table has the updated email
    update public.profiles
    set email = p_new_email,
        updated_at = now()
    where id = v_user_id;

    -- Get profile and facility info
    select
        p.role,
        coalesce(f.facility_name, 'Barangay Health Station'),
        coalesce(trim(p.first_name || ' ' || p.last_name), 'User')
    into v_role, v_facility_name, v_user_name
    from public.profiles p
    left join public.facilities f on f.id = p.facility_id
    where p.id = v_user_id;

    -- Record in activity_logs
    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_user_id,
        'User Account Email Updated',
        'Authentication',
        v_user_name || ' (' || coalesce(v_role::text, 'User') || ' at ' || v_facility_name || ') updated account email from ' || coalesce(p_old_email, 'none') || ' to ' || p_new_email || '.'
    );

    -- If user is BHW, notify all active CHO Pharmacists (PHARMA_II & PHARMA_I)
    if v_role = 'BHW' then
        for v_cho_user in
            select id from public.profiles
            where role in ('PHARMA_II', 'PHARMA_I')
              and status = 'ACTIVE'
        loop
            insert into public.notifications (user_id, title, message)
            values (
                v_cho_user.id,
                'BHW Account Email Updated',
                v_user_name || ' from ' || v_facility_name || ' has updated their official account email from ' || coalesce(p_old_email, 'none') || ' to ' || p_new_email || '.'
            );
        end loop;
    end if;

    -- Always notify the user who updated their email
    insert into public.notifications (user_id, title, message)
    values (
        v_user_id,
        'Account Email Updated',
        case
            when v_role = 'BHW' then 'Your account email has been updated to ' || p_new_email || '. City Health Office (CHO) has been notified.'
            else 'Your primary account email has been successfully updated to ' || p_new_email || '.'
        end
    );

    return true;
end;
$$;

revoke all on function public.notify_cho_of_bhw_email_update(text, text) from public, anon;
grant execute on function public.notify_cho_of_bhw_email_update(text, text) to authenticated;
