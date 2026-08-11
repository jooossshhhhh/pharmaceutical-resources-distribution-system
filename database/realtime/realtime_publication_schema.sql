/*
=====================================================
SUPABASE REALTIME PUBLICATION

Purpose:
Backs up the current tables enabled for Supabase
Realtime in the live project.

Current live publication:
- inventory
- medicine_requests
- notifications
- stock_transfers

Notes:
- This file is idempotent. It only adds a table when
  it is not already part of the supabase_realtime
  publication.
=====================================================
*/

do $$
begin
    if not exists (
        select 1
        from pg_publication p
        join pg_publication_rel pr on pr.prpubid = p.oid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = 'inventory'
    ) then
        alter publication supabase_realtime add table public.inventory;
    end if;

    if not exists (
        select 1
        from pg_publication p
        join pg_publication_rel pr on pr.prpubid = p.oid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = 'medicine_requests'
    ) then
        alter publication supabase_realtime add table public.medicine_requests;
    end if;

    if not exists (
        select 1
        from pg_publication p
        join pg_publication_rel pr on pr.prpubid = p.oid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = 'notifications'
    ) then
        alter publication supabase_realtime add table public.notifications;
    end if;

    if not exists (
        select 1
        from pg_publication p
        join pg_publication_rel pr on pr.prpubid = p.oid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = 'stock_transfers'
    ) then
        alter publication supabase_realtime add table public.stock_transfers;
    end if;
end $$;
