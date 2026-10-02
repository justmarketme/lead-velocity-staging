# Decisions log (needs_human → decided)

Written by the orchestrator only, from Jonathan's answers in the session thread. One row per decision. A row here is what flips an `NH-*` / `Q*` node in `build/tasks.json`.

| Code | Date | Decided by | Decision | Where applied |
|---|---|---|---|---|
| _(none yet — see build/gates-batch.md for the open list)_ | | | | |

## 2026-10-02 · NH-22 resolved by default (orchestrator, technical; Jonathan may override)
`ops` is **not** added to the Supabase exposed schemas. The console reads and writes `ops.*` only through the admin-only `smc_console_*` SECURITY DEFINER functions in migration 08 (admin check inside each; anon revoked). Rationale: smaller attack surface, no PostgREST exposure of the operations schema, and the W32 outbox row is written in the same transaction as the decision. Not a money, legal or publish decision.
