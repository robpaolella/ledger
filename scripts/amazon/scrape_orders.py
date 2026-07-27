#!/usr/bin/env python3
"""
Amazon order scraper sidecar for Ledger.

Wraps the `amazon-orders` library (https://github.com/alexdlaird/amazon-orders)
to pull order history + line items + the Transactions page (per-shipment charge
amounts), and drops JSON files into Ledger's data/amazon directory where the
server ingests them (services/amazonIngest.ts).

Contract (schemaVersion 1):
  orders-<UTC timestamp>.json  — written atomically (.tmp then rename)
  status.json                  — ALWAYS rewritten, even on failure

One-time setup (interactive login, persists the session):
  amazon-orders login
Then run headless on a schedule:
  python3 scrape_orders.py --days 30 --out /path/to/ledger/data/amazon
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import tempfile

SCHEMA_VERSION = 1


def write_status(out_dir: str, ok: bool, error_kind, message: str, orders_seen: int) -> None:
    status = {
        "lastRun": dt.datetime.now(dt.timezone.utc).isoformat(),
        "ok": ok,
        "errorKind": error_kind,  # "auth" | "other" | None
        "message": message,
        "ordersSeen": orders_seen,
        "sessionOk": error_kind != "auth",
    }
    path = os.path.join(out_dir, "status.json")
    fd, tmp = tempfile.mkstemp(dir=out_dir, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(status, f, indent=2)
    os.replace(tmp, path)


def money(value) -> float | None:
    """Normalize lib money values (float or None) to abs float."""
    if value is None:
        return None
    try:
        return abs(float(value))
    except (TypeError, ValueError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Amazon orders for Ledger")
    parser.add_argument("--days", type=int, default=30, help="How many days back to fetch (default 30)")
    parser.add_argument("--out", required=True, help="Output directory (Ledger's data/amazon)")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    try:
        from amazonorders.session import AmazonSession
        from amazonorders.orders import AmazonOrders
        from amazonorders.transactions import AmazonTransactions
        from amazonorders.exception import AmazonOrdersAuthError, AmazonOrdersError
    except ImportError as e:
        write_status(args.out, False, "other", f"amazon-orders not installed: {e}", 0)
        return 1

    session = AmazonSession()
    try:
        session.login()

        amazon_orders = AmazonOrders(session)
        cutoff = dt.date.today() - dt.timedelta(days=args.days)
        years = sorted({cutoff.year, dt.date.today().year})

        orders_out = []
        for year in years:
            for order in amazon_orders.get_order_history(year=year, full_details=True):
                placed = getattr(order, "order_placed_date", None)
                if placed is None or placed < cutoff:
                    continue
                items = []
                for item in (order.items or []):
                    seller = getattr(item, "seller", None)
                    items.append({
                        "title": item.title,
                        "asin": getattr(item, "asin", None),
                        "unitPrice": money(getattr(item, "price", None)),
                        "quantity": getattr(item, "quantity", None) or 1,
                        "seller": getattr(seller, "name", None) if seller else None,
                    })
                orders_out.append({
                    "orderNumber": order.order_number,
                    "orderDate": placed.isoformat(),
                    "grandTotal": money(getattr(order, "grand_total", None)),
                    "subtotal": money(getattr(order, "subtotal", None)),
                    "tax": money(getattr(order, "estimated_tax", None)),
                    "items": items,
                })

        amazon_transactions = AmazonTransactions(session)
        charges_out = []
        for txn in amazon_transactions.get_transactions(days=args.days):
            completed = getattr(txn, "completed_date", None)
            charges_out.append({
                "date": completed.isoformat() if completed else None,
                "amount": money(getattr(txn, "grand_total", None)),
                "orderNumbers": [txn.order_number] if getattr(txn, "order_number", None) else [],
                "paymentMethod": f"{getattr(txn, 'payment_method', '') or ''} {getattr(txn, 'payment_method_last_4', '') or ''}".strip() or None,
                "isRefund": bool(getattr(txn, "is_refund", False)),
            })

        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "scrapedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "rangeDays": args.days,
            "orders": orders_out,
            "charges": charges_out,
        }
        ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        final = os.path.join(args.out, f"orders-{ts}.json")
        fd, tmp = tempfile.mkstemp(dir=args.out, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, indent=2)
        os.replace(tmp, final)

        write_status(args.out, True, None, f"ok — {len(orders_out)} orders, {len(charges_out)} charges", len(orders_out))
        print(f"Wrote {final}: {len(orders_out)} orders, {len(charges_out)} charges")
        return 0

    except AmazonOrdersAuthError as e:
        write_status(args.out, False, "auth", str(e), 0)
        print(f"AUTH FAILURE: {e}", file=sys.stderr)
        return 2
    except AmazonOrdersError as e:
        write_status(args.out, False, "other", str(e), 0)
        print(f"SCRAPE FAILURE: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # noqa: BLE001 — status.json must always be written
        write_status(args.out, False, "other", f"{type(e).__name__}: {e}", 0)
        print(f"UNEXPECTED FAILURE: {e}", file=sys.stderr)
        return 1
    finally:
        try:
            session.close()
        except Exception:  # noqa: BLE001
            pass


if __name__ == "__main__":
    sys.exit(main())
