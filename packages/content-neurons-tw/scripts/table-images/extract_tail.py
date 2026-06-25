#!/usr/bin/env python3
"""Extract tail explanation figures from Yang-Ming medical board PDFs."""

from __future__ import annotations

import argparse
import io
import json
import math
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
MANIFEST = SCRIPT_DIR / "_work" / "segments-tail.json"
OUT_DIR = SCRIPT_DIR / "auto-crop-tail"
PDF_DIR = Path("~/Desktop/國考/一階國考/陽明國考考古").expanduser()

MIN_IMAGE_AREA = 5000.0
MIN_INTRINSIC_DIMENSION = 20
PURE_RASTER_MAX_VECTOR_OVERLAP = 0.05
PURE_RASTER_MAX_TEXT_CHARS = 10
DETAIL_REGION_Y_FRAC = 0.45
RENDER_SCALE = 2


@dataclass
class CandidateImage:
    page_index: int
    page_number: int
    info: dict
    bbox: fitz.Rect
    area: float
    overlap_ratio: float
    text_chars: int
    angle: int


@dataclass
class ExtractionResult:
    qid: str
    decision: str
    angle: int
    output: Path
    size: tuple[int, int]


def load_manifest() -> dict:
    with MANIFEST.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_pdf(pdf_name: str) -> Path:
    path = PDF_DIR / pdf_name
    if path.exists():
        return path
    fallback = Path("~/Desktop/國考/一階國考/陽明國考考古").expanduser() / pdf_name
    if fallback.exists():
        return fallback
    return path


def detail_rect(page: fitz.Page) -> fitz.Rect:
    return fitz.Rect(0, page.rect.height * DETAIL_REGION_Y_FRAC, page.rect.width, page.rect.height)


def intersection_area(a: fitz.Rect, b: fitz.Rect) -> float:
    inter = fitz.Rect(a) & fitz.Rect(b)
    if inter.is_empty or inter.is_infinite:
        return 0.0
    return max(0.0, inter.width) * max(0.0, inter.height)


def angle_from_transform(info: dict) -> int:
    matrix = info.get("transform")
    if not matrix:
        return 0
    angle = math.degrees(math.atan2(float(matrix[1]), float(matrix[0])))
    return int(round(angle / 90.0) * 90) % 360


def composite_stats(page: fitz.Page, image_bbox: fitz.Rect) -> tuple[float, int]:
    image_area = max(1.0, image_bbox.width * image_bbox.height)
    overlapping_vector_area = 0.0

    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect:
            overlapping_vector_area += intersection_area(image_bbox, fitz.Rect(rect))

    text_chars = 0
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if intersection_area(image_bbox, fitz.Rect(span.get("bbox", (0, 0, 0, 0)))) > 0:
                    text_chars += len(span.get("text", ""))

    return overlapping_vector_area / image_area, text_chars


def collect_candidate_images(doc: fitz.Document, pages_1based: list[int]) -> list[CandidateImage]:
    candidates: list[CandidateImage] = []
    for page_number in pages_1based:
        page_index = page_number - 1
        page = doc[page_index]
        region = detail_rect(page)
        for info in page.get_image_info(xrefs=True):
            bbox = fitz.Rect(info["bbox"])
            area = bbox.width * bbox.height
            if area < MIN_IMAGE_AREA:
                continue
            if min(int(info.get("width", 0)), int(info.get("height", 0))) < MIN_INTRINSIC_DIMENSION:
                continue
            if not region.contains(bbox.tl + (bbox.br - bbox.tl) * 0.5):
                continue
            overlap_ratio, text_chars = composite_stats(page, bbox)
            candidates.append(
                CandidateImage(
                    page_index=page_index,
                    page_number=page_number,
                    info=info,
                    bbox=bbox,
                    area=area,
                    overlap_ratio=overlap_ratio,
                    text_chars=text_chars,
                    angle=angle_from_transform(info),
                )
            )
    return sorted(candidates, key=lambda item: item.area, reverse=True)


def find_tables_in_region(page: fitz.Page, region: fitz.Rect):
    try:
        tables = page.find_tables(clip=region).tables
    except TypeError:
        tables = page.find_tables().tables
        tables = [table for table in tables if fitz.Rect(table.bbox).intersects(region)]
    return [table for table in tables if fitz.Rect(table.bbox).intersects(region)]


def render_rect(page: fitz.Page, rect: fitz.Rect, output: Path) -> tuple[int, int]:
    pix = page.get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE), clip=rect, alpha=False)
    pix.save(output)
    with Image.open(output) as image:
        return image.size


def save_extracted_image(doc: fitz.Document, candidate: CandidateImage, qid: str) -> ExtractionResult:
    xref = candidate.info.get("xref")
    if not xref:
        raise ValueError(f"{qid}: selected image has no xref")

    extracted = doc.extract_image(xref)
    ext = extracted.get("ext", "png")
    output = OUT_DIR / f"{qid}__1.{ext}"

    with Image.open(io.BytesIO(extracted["image"])) as image:
        upright = image.rotate(-candidate.angle, expand=True) if candidate.angle else image.copy()
        upright.save(output)
        size = upright.size

    return ExtractionResult(qid=qid, decision="extract", angle=candidate.angle, output=output, size=size)


def save_render_crop(doc: fitz.Document, pages_1based: list[int], qid: str) -> ExtractionResult:
    best_table: tuple[float, fitz.Page, fitz.Rect] | None = None
    first_region: tuple[fitz.Page, fitz.Rect] | None = None

    for page_number in pages_1based:
        page = doc[page_number - 1]
        region = detail_rect(page)
        if first_region is None:
            first_region = (page, region)

        for table in find_tables_in_region(page, region):
            bbox = fitz.Rect(table.bbox)
            area = bbox.width * bbox.height
            if best_table is None or area > best_table[0]:
                best_table = (area, page, bbox)

    output = OUT_DIR / f"{qid}__1.png"
    if best_table:
        _, page, rect = best_table
    else:
        if first_region is None:
            raise ValueError(f"{qid}: no pages available for render-crop")
        page, rect = first_region

    size = render_rect(page, rect, output)
    return ExtractionResult(qid=qid, decision="render-crop", angle=0, output=output, size=size)


def process_qid(qid: str, segment: dict) -> ExtractionResult:
    pdf = resolve_pdf(segment["pdf"])
    if not pdf.exists():
        raise FileNotFoundError(f"{qid}: PDF not found: {pdf}")

    with fitz.open(pdf) as doc:
        candidates = collect_candidate_images(doc, segment["pages"])
        if candidates:
            selected = candidates[0]
            pure_raster = (
                selected.overlap_ratio < PURE_RASTER_MAX_VECTOR_OVERLAP
                and selected.text_chars < PURE_RASTER_MAX_TEXT_CHARS
            )
            if pure_raster:
                return save_extracted_image(doc, selected, qid)
        return save_render_crop(doc, segment["pages"], qid)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract tail explanation figures from segments-tail.json.")
    parser.add_argument("--qids", nargs="+", help="Optional qid subset. Defaults to all qids in manifest.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    qids = args.qids or list(manifest.keys())
    failures = 0
    for qid in qids:
        segment = manifest.get(qid)
        if segment is None:
            print(f"WARNING: {qid}: not in {MANIFEST}")
            continue
        try:
            result = process_qid(qid, segment)
        except Exception as exc:
            failures += 1
            print(f"FAIL: {qid}: {exc}")
            continue
        print(
            f"{result.qid}\tdecision={result.decision}\trotation_angle={result.angle}"
            f"\toutput={result.output.name}\tPIL_size={result.size[0]}x{result.size[1]}"
        )

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
