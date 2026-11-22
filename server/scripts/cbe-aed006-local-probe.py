#!/usr/bin/env python3
"""CBE-AED-006: bounded local Chromium measurement, no network or model calls."""
import argparse
import hashlib
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

HTML = "<html><head><title>CBE local proof</title></head><body><main>CBE-AED-006</main></body></html>"

def probe(output: Path, timeout_ms: int = 10000, max_dom_bytes: int = 65536):
    if not 1000 <= timeout_ms <= 30000 or not 1 <= max_dom_bytes <= 1048576:
        raise ValueError("limits out of range")
    started = time.monotonic()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, timeout=timeout_ms)
        startup_ms = round((time.monotonic() - started) * 1000)
        try:
            page = browser.new_page()
            page.set_content(HTML, timeout=timeout_ms)
            dom = page.content().encode("utf-8")
            if len(dom) > max_dom_bytes:
                raise RuntimeError("DOM_BYTES_LIMIT_EXCEEDED")
            if page.title() != "CBE local proof":
                raise AssertionError("Unexpected document title")
            evidence = {
                "schema": "comind.cbe.aed006.probe.v1",
                "status": "passed",
                "browser_version": browser.version,
                "startup_ms": startup_ms,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "dom_bytes": len(dom),
                "dom_sha256": hashlib.sha256(dom).hexdigest(),
                "external_navigation_count": 0,
                "model_requests": 0,
                "work_credit_spend": 0,
                "retries": 0,
                "token_count": None,
                "token_count_status": "not measured",
            }
        finally:
            browser.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    return evidence

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("cbe-aed006-evidence.json"))
    parser.add_argument("--timeout-ms", type=int, default=10000)
    parser.add_argument("--max-dom-bytes", type=int, default=65536)
    args = parser.parse_args()
    print(json.dumps(probe(args.output, args.timeout_ms, args.max_dom_bytes), indent=2))
