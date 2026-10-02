-- =========================================================================
-- PRDS Migration: Avatar Rate Limiting & Storage Quota Protection
-- Tracks avatar update timestamps and enforces a 7-day rate-limiting cooldown
-- on profile picture updates to preserve Supabase Free Tier quotas.
-- =========================================================================

-- 1. Add avatar_updated_at column to public.profiles if not exists
alter table public.profiles
add column if not exists avatar_updated_at timestamptz default null;

-- 2. Update update_own_profile_avatar() RPC with 7-day cooldown enforcement
create or replace function public.update_own_profile_avatar(
    p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := (select auth.uid());
    v_last_update timestamptz;
    v_clean_url text;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    v_clean_url := nullif(trim(coalesce(p_avatar_url, '')), '');

    -- If setting a new avatar URL, check the 7-day cooldown
    if v_clean_url is not null then
        select avatar_updated_at into v_last_update
        from public.profiles
        where id = v_user_id;

        if v_last_update is not null and v_last_update > (now() - interval '7 days') then
            raise exception 'Profile picture can only be changed once every 7 days. Next change allowed after %',
                to_char(v_last_update + interval '7 days', 'YYYY-MM-DD HH24:MI:SS');
        end if;
    end if;

    update public.profiles
    set avatar_url = v_clean_url,
        avatar_updated_at = case when v_clean_url is not null then now() else avatar_updated_at end,
        updated_at = now()
    where id = v_user_id;

    if not found then
        raise exception 'Profile not found';
    end if;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_user_id,
        case when v_clean_url is not null then 'Profile Photo Updated' else 'Profile Photo Removed' end,
        'User Account',
        case when v_clean_url is not null then 'User updated their profile photo.' else 'User removed their profile photo.' end
    );
end;
$$;

revoke all on function public.update_own_profile_avatar(text) from public, anon;
grant execute on function public.update_own_profile_avatar(text) to authenticated;
