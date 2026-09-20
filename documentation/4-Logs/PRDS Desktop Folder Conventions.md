# PRDS Desktop Folder Conventions

## Application Structure

```text
prds-desktop/src/
  backend/
    client/       Supabase client and unified data-client helpers
    database/     Local SQLite and snapshot persistence
    services/     Feature and authentication service calls
    sync/         Network status, outbox, and snapshot synchronization
  frontend/
    components/  Shared layout, modal, pagination, and common UI
    context/     React providers and hooks
    hooks/       Reusable UI hooks
    routes/      Route definitions and guards
    views/       Route-level feature modules
  shared/
    utils/       Pure feature logic and matching `.test.mjs` files
```

## Placement Rules

- Put Supabase queries, RPC calls, and offline mutation handling in `backend/services`.
- Put snapshot synchronization and outbox behavior in `backend/sync`.
- Put reusable UI used by multiple features in `frontend/components`.
- Put feature-only UI in `frontend/views/<feature>/components`.
- Put pure calculations, formatting, and validation in `shared/utils`.
- Keep tests beside the utility or service they verify, using `.test.mjs`.
- Do not create empty category folders. Add a folder only when it contains a real implementation.
- Do not add a second sync engine, service layer, or utility directory for a feature.

`prds-desktop` is the maintained client. `prds-web` is retained as a frozen legacy client and should not receive new desktop organization work.
