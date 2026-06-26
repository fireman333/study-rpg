#!/usr/bin/env python3
"""
Extract pilot 詳解 figures → content-addressed webp + manifest + preview sheet.
Reads healthcheck_inventory.json (explanation-band candidates), extracts each via
extract_image(xref) (pure raster) or render-crop (composite), RGB-safe, encodes webp.
Read input only; writes assets to ../../explanation-figures/ + previews here.
"""
import argparse, hashlib, json, os, re, sys
import fitz
from PIL import Image
import detect_figures as df  # vendored parsing (parse_filename etc.)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSET_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "explanation-figures"))
SRC = os.path.expanduser("~/Desktop/國考/一階國考/陽明國考考古")
ZOOM = 2.4             # ~173 dpi render-crop (renders AS DISPLAYED → correct orientation/framing)
PAD = 6               # pt padding around an image bbox on render-crop
WEBP_Q = 82

def pdf_for(year, session, book):
    # resolve the source PDF whose filename parses to (year,session,book)
    for fn in os.listdir(SRC):
        if not fn.lower().endswith(".pdf"): continue
        info = df.parse_filename(os.path.join(SRC, fn))
        if info == (year, session, book):
            return os.path.join(SRC, fn)
    return None

def subject_of(book, qnum):
    for subj, lo, hi in df.SUBJECT_MAP.get(book, []):
        if lo <= qnum <= hi: return subj
    return None

def to_rgb_pil_from_bytes(b):
    from io import BytesIO
    im = Image.open(BytesIO(b))
    return im.convert("RGB")

def to_rgb_pil_from_pix(pix):
    if pix.n - pix.alpha >= 4 or pix.alpha:   # CMYK / has alpha → normalize via RGB cs
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

def render_crop(page, bbox):
    x0,y0,x1,y1 = bbox
    clip = fitz.Rect(max(page.rect.x0,x0-PAD), max(page.rect.y0,y0-PAD),
                     min(page.rect.x1,x1+PAD), min(page.rect.y1,y1+PAD))
    pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM,ZOOM), clip=clip)
    return to_rgb_pil_from_pix(pix)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", default=os.path.join(HERE,"healthcheck_inventory.json"))
    ap.add_argument("--only", action="append", help="filter qid prefix, e.g. 112-1-醫學一 (repeatable)")
    ap.add_argument("--manifest", default=os.path.join(ASSET_DIR,"manifest.json"))
    ap.add_argument("--preview", default=os.path.join(HERE,"figure-preview"))
    args = ap.parse_args()
    os.makedirs(ASSET_DIR, exist_ok=True); os.makedirs(args.preview, exist_ok=True)

    inv = json.load(open(args.inventory, encoding="utf-8"))
    # pilot rows: have a corpusId, an explanation candidate, and (optionally) a qid prefix filter
    rows = []
    for r in inv:
        qid = r.get("corpusId")
        if not qid: continue
        expl = [c for c in r["candidates"] if c["band"] == "explanation"]
        if not expl: continue
        if args.only and not any(qid.startswith(p) for p in args.only): continue
        rows.append((qid, r, expl))

    docs = {}
    # MERGE into the existing manifest (batch-extensible contract: earlier batches'
    # already-shipped figures MUST be unaffected). The extractor only processes the
    # --only-filtered rows, so without this load a per-batch run would overwrite the
    # whole manifest with just this batch — wiping prior batches. Re-extracting an
    # already-present qid is idempotent (content-hash filenames → identical bytes).
    manifest = json.load(open(args.manifest, encoding="utf-8")) if os.path.exists(args.manifest) else {}
    preview_rows = []
    n_extract = n_crop = n_skip = 0
    for qid, r, expl in rows:
        pdf = pdf_for(r["year"], r["session"], r["book"])
        if not pdf:
            n_skip += len(expl); continue
        if pdf not in docs: docs[pdf] = fitz.open(pdf)
        doc = docs[pdf]
        subj = subject_of(r["book"], r["qnum"])
        entries = []
        for i, c in enumerate(expl, 1):
            page = doc[c["page"]]
            try:
                # Always render-crop the DISPLAYED region: PDF placement matrix (rotation /
                # clip / scale) is applied by the renderer, so orientation + framing are
                # correct by construction. extract_image(xref) returns raw stored bytes that
                # ignore the page transform → 90° rotations + bad framing (owner-reported).
                im = render_crop(page, c["bbox"]); method = "render-crop"
            except Exception as e:
                n_skip += 1
                entries.append({"skip": True, "reason": f"{type(e).__name__}:{e}", "page": c["page"]})
                continue
            from io import BytesIO
            buf = BytesIO(); im.save(buf, "WEBP", quality=WEBP_Q, method=6); data = buf.getvalue()
            h = hashlib.sha1(data).hexdigest()[:8]
            fname = f"{qid}__{i}.{h}.webp"
            open(os.path.join(ASSET_DIR, fname), "wb").write(data)
            if method == "extract_image": n_extract += 1
            else: n_crop += 1
            entries.append({
                "src": f"content/neurons-tw/explanation-figures/{fname}",
                "provenance": {"sourcePdf": os.path.basename(pdf), "page": c["page"],
                               "bbox": c["bbox"], "booklet": f"{r['year']}-{r['session']}{r['book'][-1]}",
                               "category": subj},
                "attributionConfidence": "high" if (len(expl) == 1 and c["band"] == "explanation") else "review",
                "method": method, "bytes": len(data),
            })
        shipped = [e for e in entries if not e.get("skip")]
        if shipped:
            manifest[qid] = [{"src": e["src"], "provenance": e["provenance"],
                              "attributionConfidence": e["attributionConfidence"]} for e in shipped]
        preview_rows.append((qid, subj, len(expl), shipped))

    json.dump(manifest, open(args.manifest, "w"), ensure_ascii=False, indent=2)

    # HTML contact sheet for owner review
    html = ["<html><head><meta charset='utf-8'><style>",
            "body{font-family:sans-serif;background:#111;color:#eee}",
            ".q{border-bottom:1px solid #333;padding:8px;display:flex;gap:12px;align-items:flex-start}",
            ".meta{min-width:260px;font-size:13px}.imgs img{height:200px;margin:2px;border:1px solid #444;background:#fff}",
            ".rev{color:#fb0}</style></head><body>",
            f"<h2>Figure preview — {', '.join(args.only or ['ALL'])} — {len(manifest)} q, {n_extract+n_crop} figures</h2>"]
    for qid, subj, ncand, shipped in preview_rows:
        conf = shipped[0]["attributionConfidence"] if shipped else "?"
        html.append(f"<div class='q'><div class='meta'><b>{qid}</b><br>{subj} · {len(shipped)}/{ncand} fig "
                    f"<span class='{'rev' if conf=='review' else ''}'>[{conf}]</span></div><div class='imgs'>")
        for e in shipped:
            rel = os.path.relpath(os.path.join(ASSET_DIR, os.path.basename(e['src'])), args.preview)
            html.append(f"<img src='{rel}' loading='lazy' title='{e['method']} p{e['provenance']['page']}'>")
        html.append("</div></div>")
    html.append("</body></html>")
    open(os.path.join(args.preview, "index.html"), "w", encoding="utf-8").write("\n".join(html))

    print(f"questions: {len(manifest)} | figures: extract={n_extract} render-crop={n_crop} skip={n_skip}")
    print(f"assets → {ASSET_DIR}")
    print(f"preview → {os.path.join(args.preview,'index.html')}")

if __name__ == "__main__":
    main()
