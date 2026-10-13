"""Remove public Supabase image requests from already-generated product pages.

The catalog API is currently restricted, so a full SEO rebuild cannot run.
This updates only image URLs in existing generated HTML and leaves product
names, prices, stock text, and page structure untouched.
"""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "products"
PLACEHOLDER = "https://rrereptiles.com/images/Logo%20Letters.png"
PRODUCT_SCRIPT = "/shop/product-page.js?v=20261012-egress-1"
STORAGE_IMAGE = re.compile(
    r"https://[a-z0-9-]+\.supabase\.co/storage/v1/[^\s\"'<>\\]+",
    re.IGNORECASE,
)


def main():
    changed = 0
    manifest = json.loads((ROOT / "shop" / "product-thumbnails.json").read_text(encoding="utf-8"))
    for page in [ROOT / "product.html", *sorted(PRODUCTS.glob("*.html"))]:
        source = page.read_text(encoding="utf-8")
        updated = STORAGE_IMAGE.sub(PLACEHOLDER, source)
        item = re.search(r'data-storefront-item-id="(\d+)"', source)
        current_image = re.search(r'<meta property="og:image" content="([^"]+)"', source)
        if item and current_image:
            detail = manifest.get(item.group(1), {}).get("detail")
            if detail:
                updated = updated.replace(
                    current_image.group(1), f"https://rrereptiles.com{detail}"
                )
        # The business schema's image is the store logo, even when a product
        # previously used that same logo as its placeholder.
        updated = re.sub(
            r'("logo":\{"@type":"ImageObject","url":"https://rrereptiles\.com/images/Logo\.svg"\},"image":")[^"]+(\")',
            lambda match: match.group(1) + PLACEHOLDER + match.group(2),
            updated,
        )
        updated = re.sub(
            r"/shop/product-page\.js\?v=[^\"']+",
            PRODUCT_SCRIPT,
            updated,
        )
        if updated != source:
            page.write_text(updated, encoding="utf-8")
            changed += 1
    print(f"Sanitized {changed} existing product pages")


if __name__ == "__main__":
    main()
