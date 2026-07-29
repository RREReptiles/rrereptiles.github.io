#!/usr/bin/env python3
"""Keep SEO product URLs integrated with the original single-page website.

This wrapper reuses the established SEO helpers while deliberately avoiding the
duplicate shop, category, business, shipping, and care-guide index shells.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import quote

import build_seo as base

ORIGINAL_ROUTES = {
    "home": "/#home",
    "shop": "/#shop",
    "about": "/#about",
    "socials": "/#socials",
    "reptilog": "/#reptilog",
    "care": "/#care",
    "faq": "/#faq",
}

OBSOLETE_SHELLS = (
    base.ROOT / "about.html",
    base.ROOT / "contact.html",
    base.ROOT / "shipping.html",
    base.SHOP_DIR / "index.html",
    base.SHOP_DIR / "reptiles.html",
    base.SHOP_DIR / "reptile-supplies.html",
    base.SHOP_DIR / "feeders.html",
    base.SHOP_DIR / "aquatic-plants.html",
    base.SHOP_DIR / "entomology-art.html",
    base.CARE_DIR / "index.html",
)


def effective_purchase_mode(product: dict) -> str:
    if product.get("local_pickup_only") is True or product.get("store_category") == "feeders":
        return "inquiry"
    return base.compact_text(product.get("purchase_mode"))


def restore_original_navigation() -> None:
    base.patch_index()
    text = base.INDEX_PATH.read_text(encoding="utf-8")
    original = text

    for page, href in ORIGINAL_ROUTES.items():
        text = re.sub(
            rf'<a\s+href="[^"]*"([^>]*\bdata-page="{re.escape(page)}"[^>]*)>',
            f'<a href="{href}"\\1>',
            text,
        )

    noscript = (
        '    <!-- SEO-NOSCRIPT:BEGIN -->\n'
        '    <noscript><div class="section"><h2>Browse Red Rocks Exotic Reptiles</h2>'
        '<p>Current products, care guides, business information, and shipping details are contained on the original website.</p>'
        '<p><a href="/#shop">Shop current inventory</a> · <a href="/#care">Reptile care guides</a> · '
        '<a href="/#faq">Shipping and pickup information</a></p></div></noscript>\n'
        '    <!-- SEO-NOSCRIPT:END -->'
    )
    if "<!-- SEO-NOSCRIPT:BEGIN -->" in text:
        text = re.sub(
            r"\s*<!-- SEO-NOSCRIPT:BEGIN -->.*?<!-- SEO-NOSCRIPT:END -->",
            f"\n{noscript}",
            text,
            count=1,
            flags=re.DOTALL,
        )

    if text != original:
        base.INDEX_PATH.write_text(text, encoding="utf-8")
        print("Restored original single-page navigation")


def patch_storefront_handoff() -> None:
    base.patch_storefront_assets()
    js = base.STOREFRONT_JS_PATH.read_text(encoding="utf-8")
    original = js

    helper = """
    function handleStorefrontRequest() {
        const params = new URLSearchParams(window.location.search);
        const requestedItemId = Number(params.get('add'));
        const shouldOpenCart = params.get('cart') === 'open' || Number.isInteger(requestedItemId);

        if (Number.isInteger(requestedItemId)) addToCart(requestedItemId);
        else if (shouldOpenCart) openCart();

        if (!shouldOpenCart) return;
        params.delete('add');
        params.delete('cart');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }

"""
    if "function handleStorefrontRequest()" not in js:
        marker = "    function beginCheckout() {"
        if marker not in js:
            raise RuntimeError("Could not locate beginCheckout in shop/storefront.js")
        js = js.replace(marker, helper + marker, 1)

    if "handleStorefrontRequest();" not in js:
        js = re.sub(
            r"(renderProducts\(products\);\s*\n\s*renderCart\(\);)",
            r"\1\n            handleStorefrontRequest();",
            js,
            count=1,
        )

    if js != original:
        base.STOREFRONT_JS_PATH.write_text(js, encoding="utf-8")
        print("Wired product-page Add to Cart into the original storefront cart")


def original_header() -> str:
    return """<header class="site-header">
  <a class="brand" href="/#home"><img src="/images/Logo.svg" alt=""><span><strong>Red Rocks</strong> Exotic Reptiles</span></a>
  <nav aria-label="Primary navigation">
    <a href="/#home">Home</a>
    <a href="/#shop">Shop</a>
    <a href="/#about">About Us</a>
    <a href="/#socials">Socials</a>
    <a href="/#reptilog">ReptiLog</a>
    <a href="/#care">Care Guides</a>
    <a href="/#faq">Shipping/FAQs</a>
  </nav>
</header>"""


def original_footer() -> str:
    return f"""<footer class="site-footer">
  <div><strong>{base.BUSINESS_NAME}</strong><br>Colorado reptile store, breeder, and husbandry supplier.</div>
  <div><a href="tel:9704001278">{base.BUSINESS_PHONE_DISPLAY}</a><br><a href="mailto:{base.BUSINESS_EMAIL}">{base.BUSINESS_EMAIL}</a></div>
  <div><a href="/#shop">Shop</a> · <a href="/#about">About</a> · <a href="/#care">Care Guides</a> · <a href="/#faq">Shipping/FAQs</a></div>
</footer>"""


def product_action(product: dict) -> str:
    mode = effective_purchase_mode(product)
    if product.get("in_stock") and mode == "checkout":
        return (
            f'<a class="button" href="/?add={base.escape(product.get("item_id"))}#shop">'
            "Add to Cart</a>"
        )
    if product.get("in_stock") and mode == "inquiry":
        subject = quote(f"Inquiry about {base.compact_text(product.get('public_name'), 'product')}")
        return f'<a class="button" href="mailto:{base.BUSINESS_EMAIL}?subject={subject}">Inquire</a>'
    return '<button type="button" class="button" disabled>Out of Stock</button>'


def fulfillment_notice(product: dict) -> str:
    mode = effective_purchase_mode(product)
    if product.get("local_pickup_only") is True or product.get("store_category") == "feeders":
        return (
            '<p class="notice"><strong>Colorado local pickup only.</strong> '
            "Use the Inquire button to confirm availability, quantity, pricing, and pickup arrangements.</p>"
        )
    if mode == "inquiry":
        return (
            '<p class="notice"><strong>Contact to order.</strong> '
            "Availability and fulfillment will be confirmed before payment.</p>"
        )
    return (
        '<p class="notice"><strong>Online checkout available.</strong> '
        "The Add to Cart button uses the same live store inventory and cart as the original Shop tab.</p>"
    )


def integrate_product_pages(products: list[dict]) -> list[str]:
    urls = base.write_product_pages(products)
    header = original_header()
    footer = original_footer()

    for product in products:
        slug = base.compact_text(product.get("slug"), f"item-{product.get('item_id', 'product')}")
        path = base.PRODUCTS_DIR / f"{slug}.html"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")

        text = re.sub(
            r'<header class="site-header">.*?</header>',
            header,
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'<footer class="site-footer">.*?</footer>',
            footer,
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'\s*<nav class="breadcrumbs" aria-label="Breadcrumb">.*?</nav>',
            "",
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'<a class="button"[^>]*>(?:Shop this product|Ask about availability)</a>',
            product_action(product),
            text,
            count=1,
        )
        text = re.sub(
            r'<p class="notice">.*?</p>',
            fulfillment_notice(product),
            text,
            count=1,
            flags=re.DOTALL,
        )

        graph = {
            "@context": "https://schema.org",
            "@graph": [base.product_schema(product), base.business_schema()],
        }
        text = re.sub(
            r'<script type="application/ld\+json">.*?</script>',
            f'<script type="application/ld+json">{base.json_script(graph)}</script>',
            text,
            count=1,
            flags=re.DOTALL,
        )

        if "product-back-link" not in text:
            text = text.replace(
                '<main class="page-shell">',
                '<main class="page-shell">\n  <p class="product-back-link"><a href="/#shop">← Back to the original Shop tab</a></p>',
                1,
            )

        text = text.replace(
            "<h2>Ordering from a Colorado reptile store</h2>",
            "<h2>Ordering through the original Red Rocks storefront</h2>",
        )
        text = re.sub(
            r"<p>Red Rocks Exotic Reptiles offers secure online checkout.*?</p>",
            "<p>This product page is an extension of the original website. Add to Cart and Inquire follow the same store-controlled purchase mode, stock, and local-pickup rules used in the Shop tab.</p>",
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'<p><a href="/shipping\.html">.*?</p>',
            '<p><a href="/#shop">Browse the original Shop tab</a> or <a href="/#faq">review shipping and pickup information</a>.</p>',
            text,
            count=1,
            flags=re.DOTALL,
        )

        path.write_text(text, encoding="utf-8")

    return urls


def patch_care_guides() -> list[str]:
    urls = base.patch_care_guides()
    index_url = f"{base.BASE_URL}/care-guides/"
    urls = [url for url in urls if url != index_url]

    for path in base.CARE_DIR.glob("*.html"):
        if path.name == "index.html":
            continue
        text = path.read_text(encoding="utf-8")
        text = text.replace('href="/care-guides/"', 'href="/#care"')
        text = text.replace('href="../index.html#care"', 'href="/#care"')
        text = text.replace(f'"item":"{index_url}"', f'"item":"{base.BASE_URL}/#care"')
        path.write_text(text, encoding="utf-8")
    return urls


def remove_duplicate_shells() -> None:
    removed: list[str] = []
    for path in OBSOLETE_SHELLS:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if base.GENERATED_COMMENT not in text:
            raise RuntimeError(f"Refusing to remove non-generated page: {path.relative_to(base.ROOT)}")
        path.unlink()
        removed.append(str(path.relative_to(base.ROOT)))
    if removed:
        print("Removed duplicate shell pages: " + ", ".join(removed))


def write_llms(products: list[dict]) -> None:
    featured = "\n".join(
        f"- [{base.compact_text(product.get('public_name'))}]({base.product_url(product)}): {base.product_description(product)}"
        for product in products[:25]
    )
    content = f"""# {base.BUSINESS_NAME}

> Colorado reptile store and ethical breeder offering captive-bred reptiles, feeder insects, reptile supplies, aquatic plants, entomology art, and breeder-backed care information.

## Original website sections

- Home: {base.BASE_URL}/#home
- Shop: {base.BASE_URL}/#shop
- About: {base.BASE_URL}/#about
- Social profiles: {base.BASE_URL}/#socials
- ReptiLog: {base.BASE_URL}/#reptilog
- Care guides: {base.BASE_URL}/#care
- Shipping, pickup, contact, and policies: {base.BASE_URL}/#faq
- Email: {base.BUSINESS_EMAIL}
- Phone: {base.BUSINESS_PHONE_DISPLAY}
- Local pickup: By prior arrangement; no public walk-in storefront

## Current product detail pages

{featured}

## Content use notes

The original rrereptiles.com page is the authoritative navigation experience. Product detail URLs hand Add to Cart requests back to the same live storefront cart. Product availability and prices can change.
"""
    (base.ROOT / "llms.txt").write_text(content, encoding="utf-8")


def validate(products: list[dict]) -> None:
    required = [
        base.INDEX_PATH,
        base.ROOT / "robots.txt",
        base.ROOT / "sitemap.xml",
        base.ROOT / "llms.txt",
    ]
    missing = [str(path.relative_to(base.ROOT)) for path in required if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing generated files: {', '.join(missing)}")

    remaining = [str(path.relative_to(base.ROOT)) for path in OBSOLETE_SHELLS if path.exists()]
    if remaining:
        raise RuntimeError(f"Duplicate shell pages remain: {', '.join(remaining)}")

    index = base.INDEX_PATH.read_text(encoding="utf-8")
    if 'href="/#shop"' not in index or 'href="/#faq"' not in index:
        raise RuntimeError("Original website navigation was not restored.")

    sitemap = (base.ROOT / "sitemap.xml").read_text(encoding="utf-8")
    forbidden = (
        f"{base.BASE_URL}/shop/",
        f"{base.BASE_URL}/about.html",
        f"{base.BASE_URL}/contact.html",
        f"{base.BASE_URL}/shipping.html",
        f"{base.BASE_URL}/care-guides/index.html",
    )
    if any(url in sitemap for url in forbidden):
        raise RuntimeError("Sitemap still contains duplicate shell URLs.")

    if products:
        sample_slug = base.compact_text(products[0].get("slug"), f"item-{products[0].get('item_id', 'product')}")
        sample = (base.PRODUCTS_DIR / f"{sample_slug}.html").read_text(encoding="utf-8")
        if "Shop this product" in sample or "Ask about availability" in sample:
            raise RuntimeError("Legacy product action labels remain.")
        if 'class="breadcrumbs"' in sample:
            raise RuntimeError("Visible shell breadcrumbs remain.")
        if "/?add=" not in sample and ">Inquire</a>" not in sample and ">Out of Stock</button>" not in sample:
            raise RuntimeError("Product page is not connected to storefront purchase logic.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-fixture", type=Path)
    parser.add_argument("--allow-catalog-failure", action="store_true")
    args = parser.parse_args()

    restore_original_navigation()
    patch_storefront_handoff()
    care_urls = patch_care_guides()
    remove_duplicate_shells()
    base.write_robots()

    products: list[dict] = []
    product_urls: list[str] = []
    try:
        products = base.fetch_catalog(args.catalog_fixture)
        products.sort(
            key=lambda row: (
                not bool(row.get("in_stock")),
                int(row.get("display_order") or 9999),
                base.compact_text(row.get("public_name")).lower(),
            )
        )
        product_urls = integrate_product_pages(products)
        write_llms(products)
    except RuntimeError as error:
        if not args.allow_catalog_failure:
            raise
        print(f"Warning: {error}", file=sys.stderr)
        write_llms([])
        product_urls = [f"{base.BASE_URL}/products/{path.name}" for path in base.PRODUCTS_DIR.glob("*.html")]

    urls: list[tuple[str, str | None]] = [(f"{base.BASE_URL}/", base.TODAY)]
    urls.extend((url, base.TODAY) for url in care_urls)
    product_by_url = {
        base.product_url(product): base.compact_text(product.get("updated_at"))[:10] or base.TODAY
        for product in products
    }
    urls.extend((url, product_by_url.get(url, base.TODAY)) for url in product_urls)
    urls.extend([
        (f"{base.BASE_URL}/policies/privacy-policy.html", None),
        (f"{base.BASE_URL}/policies/terms-of-service.html", None),
    ])
    base.write_sitemap(urls)
    validate(products)
    print(f"Generated integrated SEO for {len(products)} products and {len(care_urls)} care guides.")


if __name__ == "__main__":
    main()
