#!/usr/bin/env python3
"""Generate product-description bindings before final product-page cleanup."""

from __future__ import annotations

from wire_product_descriptions import (
    PRODUCTS_DIR,
    patch_css,
    patch_product_page,
    write_product_script,
)


def main() -> None:
    write_product_script()
    changed_pages = sum(patch_product_page(path) for path in PRODUCTS_DIR.glob("*.html"))
    changed_css = patch_css()
    print(
        f"Generated product descriptions on {changed_pages} product pages; "
        f"CSS changed: {changed_css}. Final validation runs after site-shell cleanup."
    )


if __name__ == "__main__":
    main()
