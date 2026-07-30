#!/usr/bin/env python3
"""Keep generated product pages on the current carousel and storefront navigation assets."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCT_PAGE_TEMPLATE = ROOT / "scripts" / "product-page.template.js"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
PHOTO_SYNC_JS = ROOT / "shop" / "storefront-photo-sync.js"
PRODUCTS_DIR = ROOT / "products"
ASSET_VERSION = "20260729-4"


def restore_product_script() -> bool:
    template = PRODUCT_PAGE_TEMPLATE.read_text(encoding="utf-8")
    current = PRODUCT_PAGE_JS.read_text(encoding="utf-8") if PRODUCT_PAGE_JS.exists() else ""
    if current == template:
        return False
    PRODUCT_PAGE_JS.write_text(template, encoding="utf-8")
    return True


def patch_product_pages() -> int:
    changed = 0
    pattern = re.compile(r'/shop/product-page\.js(?:\?v=[^"\']*)?')
    replacement = f"/shop/product-page.js?v={ASSET_VERSION}"

    for path in PRODUCTS_DIR.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        updated = pattern.sub(replacement, text, count=1)
        if updated == text:
            continue
        path.write_text(updated, encoding="utf-8")
        changed += 1

    return changed


def validate() -> None:
    product_script = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
    for marker in (
        "function prepareProductGallery(",
        "prepareProductGallery(product);",
        "prepareProductGallery();",
        "product-detail-carousel",
        "product-detail-carousel-button",
        "product-gallery-thumbnail",
    ):
        if marker not in product_script:
            raise RuntimeError(f"Product carousel marker is missing: {marker}")

    photo_sync = PHOTO_SYNC_JS.read_text(encoding="utf-8")
    for marker in (
        "STATIC_DETAIL_PATHS",
        "/products/potato-crested-gecko.html",
        "data-storefront-detail-url",
        "window.location.assign(destination)",
        "content: none !important",
    ):
        if marker not in photo_sync:
            raise RuntimeError(f"Storefront card navigation marker is missing: {marker}")

    stale_gallery_markers = (
        "product-gallery-main-image",
        "product-gallery-thumbnails",
        "aria-pressed",
    )
    stale = [marker for marker in stale_gallery_markers if marker in product_script]
    if stale:
        raise RuntimeError(f"Legacy thumbnail gallery behavior remains: {stale}")


if __name__ == "__main__":
    restored_script = restore_product_script()
    updated_pages = patch_product_pages()
    validate()
    print(
        f"Restored product script: {restored_script}; "
        f"updated {updated_pages} product page asset reference(s) to {ASSET_VERSION}."
    )
