"""Build Cloudflare-hosted product photos from images already in this repository.

This never reads from or changes Supabase Storage. Catalog items without a
verified local source intentionally receive the site's placeholder image.
"""

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "products"
OUTPUT = ROOT / "images" / "product-thumbnails"
MANIFEST = ROOT / "shop" / "product-thumbnails.json"


def product_source(page: Path, previous: dict):
    text = page.read_text(encoding="utf-8")
    item = re.search(r'data-storefront-item-id="(\d+)"', text)
    if not item:
        return None
    saved = previous.get(item.group(1), {}).get("source")
    image = re.search(r'<meta property="og:image" content="([^"]+)"', text)
    source_url = saved or (image.group(1) if image else "")
    parsed = urlparse(source_url)
    if parsed.hostname not in {None, "rrereptiles.com", "www.rrereptiles.com"}:
        return None
    source = (ROOT / unquote(parsed.path).lstrip("/")).resolve()
    if ROOT / "images" not in source.parents or not source.is_file() or OUTPUT in source.parents:
        return None
    return item.group(1), source, parsed.path


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    try:
        previous = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    source_bytes = 0
    output_bytes = 0
    for page in sorted(PRODUCTS.glob("*.html")):
        found = product_source(page, previous)
        if found is None:
            continue
        item_id, source, source_path = found
        if item_id in manifest:
            continue
        try:
            with Image.open(source) as original:
                image = ImageOps.exif_transpose(original)
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if "A" in image.mode else "RGB")
                variants = {}
                for label, size in (("card", 480), ("detail", 960)):
                    resized = image.copy()
                    resized.thumbnail((size, size), Image.Resampling.LANCZOS)
                    target = OUTPUT / f"{item_id}-{size}.webp"
                    resized.save(target, "WEBP", quality=76, method=3)
                    variants[label] = f"/images/product-thumbnails/{target.name}?v=20261012-egress-2"
                    output_bytes += target.stat().st_size
                source_bytes += source.stat().st_size
                manifest[item_id] = {**variants, "source": source_path}
        except (OSError, ValueError) as error:
            print(f"Skipping {page.name}: {error}")
    MANIFEST.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(manifest)} products: {source_bytes:,} source bytes -> {output_bytes:,} thumbnail bytes")


if __name__ == "__main__":
    main()
