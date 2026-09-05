/*
=====================================================
Pharma II Backend Auth Hardening - 2026-08-31

Purpose:
- Keep Pharma II as an admin-assigned role only.
- Require active CHO assignment for Pharma II authority.
- Prevent accidental lockout by preserving at least one
  active Pharma II assigned to CHO.
=====================================================
*/

create or replace function public.is_pharma_ii()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        join public.facilities f
          on f.id = p.facility_id
        where p.id = public.get_current_profile_id()
          and p.role = 'PHARMA_II'
          and p.status = 'ACTIVE'
          and f.status = 'ACTIVE'
          and f.facility_type = 'CHO'
    );
$$;

revoke all on function public.is_pharma_ii() from public, anon;
grant execute on function public.is_pharma_ii() to authenticated;

drop policy if exists "users_can_insert_own_profile" on public.profiles;

create policy "users_can_insert_own_profile"
on public.profiles
for insert
to authenticated
with check (
    id = auth.uid()
    and status = 'PENDING'
    and role in ('BHW', 'PHARMA_I')
    and approved_by is null
    and approved_at is null
);

create or replace function public.prevent_last_active_pharma_ii_lockout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_was_active_cho_pharma_ii boolean := false;
    v_will_remain_active_cho_pharma_ii boolean := false;
    v_other_active_cho_pharma_ii_count integer := 0;
begin
    if tg_op = 'UPDATE' then
        select exists (
            select 1
            from public.facilities f
            where f.id = old.facility_id
              and old.role = 'PHARMA_II'
              and old.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_was_active_cho_pharma_ii;

        if not v_was_active_cho_pharma_ii then
            return new;
        end if;

        select exists (
            select 1
            from public.facilities f
            where f.id = new.facility_id
              and new.role = 'PHARMA_II'
              and new.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_will_remain_active_cho_pharma_ii;

        if v_will_remain_active_cho_pharma_ii then
            return new;
        end if;
    elsif tg_op = 'DELETE' then
        select exists (
            select 1
            from public.facilities f
            where f.id = old.facility_id
              and old.role = 'PHARMA_II'
              and old.status = 'ACTIVE'
              and f.status = 'ACTIVE'
              and f.facility_type = 'CHO'
        )
        into v_was_active_cho_pharma_ii;

        if not v_was_active_cho_pharma_ii then
            return old;
        end if;
    end if;

    select count(*)::integer
    into v_other_active_cho_pharma_ii_count
    from public.profiles p
    join public.facilities f
      on f.id = p.facility_id
    where p.id <> old.id
      and p.role = 'PHARMA_II'
      and p.status = 'ACTIVE'
      and f.status = 'ACTIVE'
      and f.facility_type = 'CHO';

    if v_other_active_cho_pharma_ii_count = 0 then
        raise exception 'At least one active Pharmacist II assigned to CHO must remain.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

revoke all on function public.prevent_last_active_pharma_ii_lockout() from public, anon, authenticated;

drop trigger if exists prevent_last_active_pharma_ii_lockout_on_update
on public.profiles;

create trigger prevent_last_active_pharma_ii_lockout_on_update
before update of role, status, facility_id
on public.profiles
for each row
execute function public.prevent_last_active_pharma_ii_lockout();

drop trigger if exists prevent_last_active_pharma_ii_lockout_on_delete
on public.profiles;

create trigger prevent_last_active_pharma_ii_lockout_on_delete
before delete
on public.profiles
for each row
execute function public.prevent_last_active_pharma_ii_lockout();
