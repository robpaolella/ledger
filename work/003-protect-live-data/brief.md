# 003 — Protect live data

## Ask
Robert moved his live Ledger database into `data/` in this repo. Protect it from agents.

## Starting point
`data/` is git-ignored and is the Docker volume path. Nothing tells agents it holds real
financial data. `npm run db:backup` copies only `ledger.db`, but most recent changes sit in
`ledger.db-wal`.

## Done means
- AGENTS.md tells every agent `data/` is live data: never write, reset, migrate or delete it,
  and never run anything against it.
- The incomplete-backup problem is recorded as a follow-up.
