# Amazon order scraper sidecar

Pulls your Amazon order history (items + per-shipment charge amounts) into
`data/amazon/` as JSON, where the Ledger server ingests it nightly and matches
charges to transactions (Settings → AI shows status).

Runs on the **host** (not in the Ledger container) because the first login is
interactive and the `amazon-orders` library needs occasional maintenance when
Amazon changes their markup.

## One-time setup

```bash
python3 -m venv ~/.venvs/amazon
~/.venvs/amazon/bin/pip install -r requirements.txt

# Interactive login (password + OTP/captcha). Persists a session for headless runs.
~/.venvs/amazon/bin/amazon-orders login
```

If the session ever expires, Ledger raises an "Amazon session expired"
notification — just re-run the login command above.

## Manual run / backfill

```bash
# Dev data dir:
~/.venvs/amazon/bin/python scrape_orders.py --days 90 --out /home/robert/git/ledger/packages/server/data/amazon
# Prod (bind-mounted ./data):
~/.venvs/amazon/bin/python scrape_orders.py --days 30 --out /path/to/ledger/data/amazon
```

The server ingests new files on its nightly run, or immediately via
Settings → AI → "Run now" (`POST /api/amazon/run`).

## Nightly schedule (systemd)

`~/.config/systemd/user/ledger-amazon.service`:
```ini
[Unit]
Description=Ledger Amazon order scrape

[Service]
Type=oneshot
ExecStart=%h/.venvs/amazon/bin/python /home/robert/git/ledger/scripts/amazon/scrape_orders.py --days 30 --out /home/robert/git/ledger/packages/server/data/amazon
```

`~/.config/systemd/user/ledger-amazon.timer`:
```ini
[Unit]
Description=Nightly Ledger Amazon scrape

[Timer]
OnCalendar=*-*-* 05:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now ledger-amazon.timer
```

05:00 is deliberately before the daily bank sync (05:30) so the same night's
ingest picks the fresh file up.

## File contract (schemaVersion 1)

- `orders-<ts>.json` — `{ schemaVersion, scrapedAt, rangeDays, orders[], charges[] }`,
  written atomically. Orders carry line items; charges are the Transactions-page
  rows (per-shipment amounts) used for matching.
- `status.json` — `{ lastRun, ok, errorKind: "auth"|"other"|null, message, ordersSeen, sessionOk }`,
  rewritten on every run including failures.
