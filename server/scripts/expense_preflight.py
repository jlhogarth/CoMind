#!/usr/bin/env python3
"""GOV-FIN-001 local preflight. No external requests or charges."""
import argparse
import json
import sys

def evaluate(data):
    if not isinstance(data, dict):
        raise ValueError("input must be an object")
    provider = data.get("provider")
    purpose = data.get("purpose")
    if not isinstance(provider, str) or not provider.strip() or not isinstance(purpose, str) or not purpose.strip():
        raise ValueError("provider and purpose are required")
    cost = data.get("estimated_usd")
    maximum = data.get("maximum_usd")
    for name, value in (("estimated_usd", cost), ("maximum_usd", maximum)):
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or value != value or value == float("inf")):
            raise ValueError(name + " must be finite and nonnegative")
    if cost is not None and maximum is not None and maximum < cost:
        raise ValueError("maximum_usd must be >= estimated_usd")
    incremental = data.get("incremental_cost", True)
    if not isinstance(incremental, bool):
        raise ValueError("incremental_cost must be boolean")
    approved = data.get("approved", False) is True
    approval_scope = data.get("approval_scope")
    approved_cap = data.get("approved_maximum_usd")
    bounded = maximum is not None and approved_cap is not None and isinstance(approved_cap, (int, float)) and not isinstance(approved_cap, bool) and approved_cap >= maximum
    permitted = not incremental or (approved and bool(approval_scope) and bounded)
    suspicious = maximum is None or (cost is not None and maximum is not None and maximum > 2 * cost)
    return {"decision": "allow" if permitted else "block", "provider": provider, "purpose": purpose,
            "requires_approval": incremental, "approval_verified": bool(approved and approval_scope and bounded),
            "cost_unknown": maximum is None, "anomaly_review": suspicious,
            "note": "Local decision only; not a provider-enforced spending cap."}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="JSON preflight request file")
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as handle:
        request = json.load(handle)
    result = evaluate(request)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["decision"] == "allow" else 3

if __name__ == "__main__":
    sys.exit(main())
