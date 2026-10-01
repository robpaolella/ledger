# 003 — Log

## 2026-09-30
- Live data arrived from the Debian machine into `data/`. Health check ok. Its `-wal` file is
  750 KB against a 61 KB main file, so a copy of `ledger.db` alone loses recent changes.
- A consistent backup (SQLite backup API) is at `~/ledger-backups/ledger-2026-09-30.db`,
  outside the repo.
