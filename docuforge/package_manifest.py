"""Create a provenance manifest and optionally verify a downloaded publication."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from manifest import build_manifest, verify_manifest, verify_publication


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("context", type=Path, help="JSON metadata and validation evidence")
    parser.add_argument("output", type=Path)
    parser.add_argument("artifacts", type=Path, nargs="+")
    parser.add_argument("--readback", type=Path, help="Directory populated by authenticated download")
    parser.add_argument("--receipts", type=Path, help="JSON receipts keyed by artifact filename")
    args = parser.parse_args()
    if (args.readback is None) != (args.receipts is None):
        parser.error("--readback and --receipts must be supplied together")
    context = json.loads(args.context.read_text(encoding="utf-8"))
    manifest = build_manifest(artifacts=args.artifacts, **context)
    if not all(verify_manifest({**manifest, "artifacts": [item]}, path.parent)
               for item, path in zip(manifest["artifacts"], args.artifacts)):
        parser.error("The source artifacts changed while the manifest was being built")
    success = args.readback is None or verify_publication(
        manifest, json.loads(args.receipts.read_text(encoding="utf-8")), args.readback
    )
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(manifest, output, indent=2)
        output.write("\n")
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
