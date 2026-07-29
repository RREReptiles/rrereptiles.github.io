#!/usr/bin/env python3
"""Simplify generated product pages for customers while preserving cart bindings."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_DIR = ROOT / "products"

PUBLIC_COPY_REPLACEMENTS = (
    ("← Back to the original Shop tab", "← Back to Shop"),
    ("← Back to the Shop tab", "← Back to Shop"),
    ("same live store inventory and cart as the original Shop tab", "current store inventory and cart"),
    ("Browse the original Shop tab", "Browse the Shop tab"),
    ("contained on the original website", "available throughout this website"),
    ("## Original website sections", "## Website sections"),
    (
        "The original rrereptiles.com page is the authoritative navigation experience.",
        "rrereptiles.com is the primary website.",
    ),
)


def preserve_hidden_item_id(text: str, path: Path) -> str:
    body_match = re.search(r'<body[^>]*\bdata-storefront-item-id="(\d+)"[^>]*>', text)
    if body_match:
        return text

    visible_match = re.search(r"<dt>Product ID</dt><dd>(\d+)</dd>", text)
    if not visible_match:
        raise RuntimeError(f"Could not preserve the product binding for {path.name}")

    item_id = visible_match.group(1)
    return re.sub(
        r"<body([^>]*)>",
        rf'<body\1 data-storefront-item-id="{item_id}">',
        text,
        count=1,
    )


def clean_product_page(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    text = preserve_hidden_item_id(text, path)

    # Seller, location, and product ID are internal details and should not be shown.
    text = re.sub(
        r'\s*<dl class="details-list">.*?</dl>',
        "",
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Remove the generic explanatory card beneath every product.
    text = re.sub(
        r'\s*<section class="content-panel">\s*<h2>Ordering.*?</section>',
        "",
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )

    for old, new in PUBLIC_COPY_REPLACEMENTS:
        text = text.replace(old, new)

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def clean_supporting_copy() -> int:
    changed = 0
    for path in (ROOT / "index.html", ROOT / "llms.txt"):
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        updated = text
        for old, new in PUBLIC_COPY_REPLACEMENTS:
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    return changed


def validate() -> None:
    pages = list(PRODUCTS_DIR.glob("*.html"))
    if not pages:
        raise RuntimeError("No generated product pages were found.")

    failures: list[str] = []
    forbidden = (
        '<dl class="details-list">',
        "<dt>Seller</dt>",
        "<dt>Location</dt>",
        "<dt>Product ID</dt>",
        '<section class="content-panel">',
        "Ordering through the original",
        "extension of the original website",
        "original Shop tab",
    )

    for path in pages:
        text = path.read_text(encoding="utf-8")
        if not re.search(r'<body[^>]*\bdata-storefront-item-id="\d+"', text):
            failures.append(f"{path.name}: missing hidden product binding")
        for value in forbidden:
            if value.lower() in text.lower():
                failures.append(f"{path.name}: contains {value}")

    supporting_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "index.html", ROOT / "llms.txt")
        if path.exists()
    ).lower()
    if "original website" in supporting_text:
        failures.append("supporting website copy still says original website")

    if failures:
        raise RuntimeError("Product-page cleanup failed: " + "; ".join(failures))


def main() -> None:
    changed_pages = sum(clean_product_page(path) for path in PRODUCTS_DIR.glob("*.html"))
    changed_supporting = clean_supporting_copy()
    validate()
    print(
        f"Cleaned customer-facing product details on {changed_pages} product pages "
        f"and {changed_supporting} supporting files."
    )


if __name__ == "__main__":
    main()
