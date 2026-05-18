#!/usr/bin/env python3
"""Compress the extracted medexam2 PNGs in place using PIL adaptive palette
quantization. For mostly-grayscale clinical images (X-ray / CT / MRI /
microscopy) 128-color adaptive palette yields ~60-70% size reduction with no
visible loss.

Usage:
  python3 tools/compress-medexam2-images.py [--colors 128] [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = REPO_ROOT / "apps/medexam2-hospital-tw/public/images/medexam2-tw"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--colors", type=int, default=128, help="adaptive palette size")
    ap.add_argument("--dry-run", action="store_true", help="show stats only, don't write")
    args = ap.parse_args()

    pngs = sorted(IMG_DIR.glob("*.png"))
    if not pngs:
        print(f"No PNGs in {IMG_DIR}", file=sys.stderr)
        return 1

    before_total = 0
    after_total = 0
    saved_count = 0
    skipped = 0

    for path in pngs:
        before = path.stat().st_size
        before_total += before
        try:
            img = Image.open(path)
            # Skip already-tiny images (probably icons; not worth)
            if before < 4096:
                after_total += before
                skipped += 1
                continue
            # Convert palette images back to RGB first, then quantize
            if img.mode != "RGB":
                img = img.convert("RGB")
            quant = img.quantize(colors=args.colors)
        except Exception as e:  # noqa: BLE001
            print(f"  SKIP {path.name} (decode error: {e})")
            after_total += before
            skipped += 1
            continue

        if args.dry_run:
            # Estimate by saving to bytes
            import io
            buf = io.BytesIO()
            quant.save(buf, format="PNG", optimize=True)
            after = len(buf.getvalue())
        else:
            quant.save(path, format="PNG", optimize=True)
            after = path.stat().st_size

        after_total += after
        saved_count += 1

    print(f"\n=== Compression stats ({'dry-run' if args.dry_run else 'WRITE'}) ===")
    print(f"  files processed:   {saved_count}")
    print(f"  files skipped:     {skipped} (too small / decode error)")
    print(f"  before:            {before_total / 1024 / 1024:.2f} MB")
    print(f"  after:             {after_total / 1024 / 1024:.2f} MB")
    saved = before_total - after_total
    pct = 100 * saved / before_total if before_total else 0
    print(f"  saved:             {saved / 1024 / 1024:.2f} MB ({pct:.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
