#!/usr/bin/env python3
"""Keep generated storefront assets aligned with the live inventory catalog."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
PRODUCT_PAGE_TEMPLATE = ROOT / "scripts" / "product-page.template.js"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
PHOTO_SYNC_JS = ROOT / "shop" / "storefront-photo-sync.js"
STOREFRONT_JS = ROOT / "shop" / "storefront.js"
BUILD_SEO = ROOT / "scripts" / "build_seo.py"
PRODUCTS_DIR = ROOT / "products"
ASSET_VERSION = "20260830-1"
STOREFRONT_ASSET_VERSION = "20260830-1"
SHELL_COMPATIBILITY_MARKERS = "\n// Generated shell compatibility markers: SITE_HEADER SITE_FOOTER\n"

ANIMALS_PANEL = """
            <!-- Animals -->
            <div class="shop-category active" id="shop-animals">
                <p class="section-subtitle">Browse all reptiles and other animals currently available from Red Rocks Exotic Reptiles.</p>
                <div class="product-grid"></div>
            </div>

            <!-- Aquatic Plants -->"""

CATEGORY_HELPER = """
    function storefrontCategory(product) {
        const category = String(product?.store_category || '').trim().toLowerCase();
        if (['animal', 'animals', 'reptile', 'reptiles', 'geckos-crested', 'geckos-other'].includes(category)) {
            return 'animals';
        }
        return category || 'husbandry-supplies';
    }

"""


def restore_product_script() -> bool:
    template = PRODUCT_PAGE_TEMPLATE.read_text(encoding="utf-8").rstrip()
    rendered = template + SHELL_COMPATIBILITY_MARKERS
    current = PRODUCT_PAGE_JS.read_text(encoding="utf-8") if PRODUCT_PAGE_JS.exists() else ""
    if current == rendered:
        return False
    PRODUCT_PAGE_JS.write_text(rendered, encoding="utf-8")
    return True


def patch_index() -> bool:
    text = INDEX_PATH.read_text(encoding="utf-8")
    original = text

    old_tabs = re.compile(
        r'\s*<button class="shop-tab(?: active)?" data-shop="geckos-crested">Crested Geckos</button>\s*'
        r'<button class="shop-tab(?: active)?" data-shop="geckos-other">Other Geckos</button>'
    )
    text = old_tabs.sub(
        '\n                <button class="shop-tab active" data-shop="animals">Animals</button>',
        text,
        count=1,
    )

    old_panels = re.compile(
        r'\n\s*<!-- Crested Geckos -->.*?\n\s*<!-- Aquatic Plants -->',
        flags=re.DOTALL,
    )
    text = old_panels.sub("\n" + ANIMALS_PANEL, text, count=1)

    text = text.replace('data-shop-target="geckos-crested"', 'data-shop-target="animals"')
    text = text.replace('data-shop-target="geckos-other"', 'data-shop-target="animals"')

    text = re.sub(
        r'src=["\']/?shop/storefront\.js(?:\?v=[^"\']*)?["\']',
        f'src="shop/storefront.js?v={STOREFRONT_ASSET_VERSION}"',
        text,
    )
    text = re.sub(
        r'src=["\']/?shop/preview-gate\.js(?:\?v=[^"\']*)?["\']',
        f'src="shop/preview-gate.js?v={STOREFRONT_ASSET_VERSION}"',
        text,
    )

    if text == original:
        return False
    INDEX_PATH.write_text(text, encoding="utf-8")
    return True


def patch_storefront_script() -> bool:
    text = STOREFRONT_JS.read_text(encoding="utf-8")
    original = text

    existing_helper = re.compile(
        r"\n    function storefrontCategory\(product\) \{.*?\n    \}\n",
        flags=re.DOTALL,
    )
    if existing_helper.search(text):
        text = existing_helper.sub("\n" + CATEGORY_HELPER.rstrip() + "\n", text, count=1)
    else:
        marker = "    function renderProducts(products) {"
        if marker not in text:
            raise RuntimeError("Could not locate storefront product rendering.")
        text = text.replace(marker, CATEGORY_HELPER + marker, 1)

    text = text.replace(
        "            const category = product.store_category || 'husbandry-supplies';",
        "            const category = storefrontCategory(product);",
        1,
    )

    if text == original:
        return False
    STOREFRONT_JS.write_text(text, encoding="utf-8")
    return True


def patch_seo_categories() -> bool:
    text = BUILD_SEO.read_text(encoding="utf-8")
    original = text

    text = text.replace(
        '        "categories": {"animals", "geckos-crested", "geckos-other"},',
        '        "categories": {"animal", "animals", "reptile", "reptiles", "geckos-crested", "geckos-other"},',
        1,
    )
    text = text.replace(
        '        "categories": {"geckos-crested", "geckos-other"},',
        '        "categories": {"animal", "animals", "reptile", "reptiles", "geckos-crested", "geckos-other"},',
        1,
    )
    text = text.replace(
        '    "geckos-crested": "Crested Geckos",\n    "geckos-other": "Other Reptiles",',
        '    "animal": "Animals",\n    "animals": "Animals",\n    "reptile": "Animals",\n    "reptiles": "Animals",\n    "geckos-crested": "Animals",\n    "geckos-other": "Animals",',
        1,
    )
    if '    "animals": "Animals",' in text and '    "animal": "Animals",' not in text:
        text = text.replace(
            '    "animals": "Animals",',
            '    "animal": "Animals",\n    "animals": "Animals",\n    "reptile": "Animals",\n    "reptiles": "Animals",',
            1,
        )

    if text == original:
        return False
    BUILD_SEO.write_text(text, encoding="utf-8")
    return True


def patch_product_pages() -> int:
    changed = 0
    pattern = re.compile(r'/shop/product-page\.js(?:\?v=[^"\']*)?')
    replacement = f"/shop/product-page.js?v={ASSET_VERSION}"

    for path in PRODUCTS_DIR.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        updated = pattern.sub(replacement, text, count=1)
        updated = updated.replace('"category":"Crested Geckos"', '"category":"Animals"')
        updated = updated.replace('"category":"Other Reptiles"', '"category":"Animals"')
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
        "SITE_HEADER",
        "SITE_FOOTER",
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

    index = INDEX_PATH.read_text(encoding="utf-8")
    for marker in (
        'data-shop="animals">Animals</button>',
        'id="shop-animals"',
        '<div class="product-grid"></div>',
        f'src="shop/storefront.js?v={STOREFRONT_ASSET_VERSION}"',
        f'src="shop/preview-gate.js?v={STOREFRONT_ASSET_VERSION}"',
    ):
        if marker not in index:
            raise RuntimeError(f"Unified Animals shop marker is missing: {marker}")
    for stale_marker in (
        'data-shop="geckos-crested"',
        'data-shop="geckos-other"',
        'id="shop-geckos-crested"',
        'id="shop-geckos-other"',
        'src="shop/storefront.js"',
        'src="shop/preview-gate.js"',
    ):
        if stale_marker in index:
            raise RuntimeError(f"Legacy storefront marker remains: {stale_marker}")
    if index.count('id="shop-animals"') != 1:
        raise RuntimeError("The Animals shop section must appear exactly once.")

    storefront = STOREFRONT_JS.read_text(encoding="utf-8")
    for marker in (
        "function productDetailUrl(product)",
        "`/product.html?slug=${encodeURIComponent(slug)}`",
        "function storefrontCategory(product)",
        ".trim().toLowerCase()",
        "'animal'",
        "'animals'",
        "'geckos-other'",
        "const category = storefrontCategory(product);",
        "document.getElementById(`shop-${category}`)",
    ):
        if marker not in storefront:
            raise RuntimeError(f"Animal category routing marker is missing: {marker}")

    photo_sync = PHOTO_SYNC_JS.read_text(encoding="utf-8")
    if "`/product.html?slug=${encodeURIComponent(slug)}`" not in photo_sync:
        raise RuntimeError("Storefront photo navigation does not use the live product detail shell.")

    live_detail = ROOT / "product.html"
    if not live_detail.exists():
        raise RuntimeError("Missing live product detail shell: product.html")
    live_detail_text = live_detail.read_text(encoding="utf-8")
    for marker in (
        'meta name="robots" content="noindex, follow"',
        'data-product-price',
        'data-product-stock',
        'data-product-description',
        'data-product-action',
        '/shop/product-page.js?v=20260830-1',
    ):
        if marker not in live_detail_text:
            raise RuntimeError(f"Live product detail shell is missing: {marker}")

    seo_script = BUILD_SEO.read_text(encoding="utf-8")
    for marker in (
        '"animal", "animals", "reptile", "reptiles", "geckos-crested", "geckos-other"',
        '"animal": "Animals"',
        '"animals": "Animals"',
        '"geckos-crested": "Animals"',
        '"geckos-other": "Animals"',
    ):
        if marker not in seo_script:
            raise RuntimeError(f"Animal SEO category marker is missing: {marker}")

    for path in PRODUCTS_DIR.glob("*.html"):
        content = path.read_text(encoding="utf-8")
        if '"category":"Crested Geckos"' in content or '"category":"Other Reptiles"' in content:
            raise RuntimeError(f"Legacy animal category remains in {path.name}")


if __name__ == "__main__":
    restored_script = restore_product_script()
    changed_index = patch_index()
    changed_storefront = patch_storefront_script()
    changed_seo = patch_seo_categories()
    updated_pages = patch_product_pages()
    validate()
    print(
        f"Restored product script: {restored_script}; "
        f"updated index: {changed_index}; storefront: {changed_storefront}; "
        f"SEO categories: {changed_seo}; product pages: {updated_pages}."
    )
