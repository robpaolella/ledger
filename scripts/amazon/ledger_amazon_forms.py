"""
Ledger's fix for amazon-orders' PlaywrightJSAuthForm timeout.

Upstream (v4.4.6) waits for the browser to navigate AWAY from the challenge
URL — but when Amazon serves the JS bot-detection page on a URL it reloads
in place on success (e.g. amazon.com/ root), the URL never changes and the
wait times out even though the challenge resolved.

This subclass polls the page CONTENT until the robot text disappears, then
hops to a distinct URL so the base class's wait-for-url predicate fires and
its cookie harvesting proceeds unchanged.

Wired into the venv via a .pth file pointing at this directory; referenced in
~/.config/amazonorders/config.yml as ledger_amazon_forms.LedgerJSAuthForm.
"""
from __future__ import annotations

import re
import time
from typing import Any, Optional

from amazonorders.contrib.browser.playwright import PlaywrightJSAuthForm

# Any URL whose path differs from the challenge page's; the order-history page
# also primes the session cookies we're about to harvest.
_HOP_URL = "https://www.amazon.com/gp/css/order-history"


class LedgerJSAuthForm(PlaywrightJSAuthForm):
    def _on_challenge_page(self, page: Any, context: Any, output_dir: Optional[str]) -> None:
        super()._on_challenge_page(page, context, output_dir)
        deadline = time.time() + self.config.browser_timeout
        while time.time() < deadline:
            try:
                if not re.search(self.regex, page.content()):
                    # Challenge resolved in place — navigate somewhere with a
                    # different path so the base wait_for_url resolves.
                    page.goto(_HOP_URL)
                    return
            except Exception:  # noqa: BLE001 — transient mid-navigation states
                pass
            time.sleep(1)
        # Deadline passed with the robot text still present: fall through and
        # let the base class produce its normal timeout error.
