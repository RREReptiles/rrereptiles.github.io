#!/usr/bin/env python3
"""Apply final integration patches to product pages and care-guide navigation."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "index.html"
STOREFRONT_JS = ROOT / "shop" / "storefront.js"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
PRODUCTS_DIR = ROOT / "products"
BUSINESS_EMAIL = "rrereptiles@gmail.com"

WESTERN_HOGNOSE_CARD = """                <a href="care-guides/western-hognose-snake.html" class="guide-card" data-care="snakes" style="color:inherit;" hidden>
                    <div class="guide-icon">&#129422;</div>
                    <div>
                        <h4>Western Hognose Snake</h4>
                        <p>Heterodon nasicus</p>
                    </div>
                </a>
"""

CARE_REPTILOG_PROMO = """            <aside class="feature-card" data-care-reptilog-promo aria-label="More reptile care guides in ReptiLog" style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;margin-bottom:2rem;padding:1.4rem 1.5rem;">
                <img src="images/ReptiLog%20Icon.png" alt="ReptiLog app icon" loading="lazy" decoding="async" style="width:72px;height:72px;border-radius:16px;box-shadow:0 3px 14px rgba(0,0,0,.18);flex:0 0 auto;">
                <div style="flex:1 1 260px;">
                    <p style="color:var(--accent);font-size:.78rem;font-weight:700;letter-spacing:.04em;margin-bottom:.15rem;">ReptiLog by Red Rocks Exotic Reptiles</p>
                    <h3 style="font-size:1.2rem;margin-bottom:.35rem;">Looking for more care guides?</h3>
                    <p style="color:var(--gray);font-size:.94rem;margin-bottom:.55rem;">Our website care-guide library is still growing. ReptiLog includes hundreds of reptile species profiles and care guides, with more being added as the library grows.</p>
                    <a href="/#reptilog" data-page="reptilog" style="font-weight:700;">Explore the ReptiLog species library &rarr;</a>
                </div>
            </aside>

"""

LEGACY_CARE_GUIDE_FOOTER = """            <div style="margin-top:2.5rem;" class="shop-notice">
                <strong>Need a care guide for a species not listed?</strong> Reach out and we'll be happy to provide guidance or point you in the right direction. We're always here to help, even after purchase!
            </div>
"""

CARE_REPTILOG_FOOTER = """            <div style="margin-top:2.5rem;" class="shop-notice" data-care-reptilog-footer>
                <strong>Can't find your species here?</strong> ReptiLog's species library includes hundreds of reptile profiles and care guides beyond what we currently have on the website. <a href="/#reptilog" data-page="reptilog">Take a look at ReptiLog &rarr;</a>
            </div>
"""


def read_storefront_config() -> tuple[str, str]:
    text = STOREFRONT_JS.read_text(encoding="utf-8")
    url_match = re.search(r"const SUPABASE_URL = '([^']+)'", text)
    key_match = re.search(r"const SUPABASE_PUBLISHABLE_KEY = '([^']+)'", text)
    if not url_match or not key_match:
        raise RuntimeError("Could not read public storefront configuration.")
    return url_match.group(1), key_match.group(1)


def patch_storefront_request() -> None:
    text = STOREFRONT_JS.read_text(encoding="utf-8")
    helper = """
    function handleStorefrontRequest() {
        const params = new URLSearchParams(window.location.search);
        const requestedValue = params.get('add');
        const requestedItemId = requestedValue === null ? null : Number(requestedValue);
        const hasRequestedItem = Number.isInteger(requestedItemId) && requestedItemId > 0;
        const shouldOpenCart = params.get('cart') === 'open' || hasRequestedItem;

        if (hasRequestedItem) addToCart(requestedItemId);
        else if (shouldOpenCart) openCart();

        if (!shouldOpenCart) return;
        params.delete('add');
        params.delete('cart');
        const query = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
"""
    if "function handleStorefrontRequest()" in text:
        text = re.sub(
            r"\n    function handleStorefrontRequest\(\) \{.*?\n    \}\n",
            "\n" + helper.rstrip() + "\n",
            text,
            count=1,
            flags=re.DOTALL,
        )
    else:
        marker = "    function beginCheckout() {"
        if marker not in text:
            raise RuntimeError("Could not locate storefront checkout functions.")
        text = text.replace(marker, helper + "\n\n" + marker, 1)

    if "handleStorefrontRequest();" not in text:
        text = re.sub(
            r"(renderProducts\(products\);\s*\n\s*renderCart\(\);)",
            r"\1\n            handleStorefrontRequest();",
            text,
            count=1,
        )

    STOREFRONT_JS.write_text(text, encoding="utf-8")


def write_live_product_script() -> None:
    supabase_url, publishable_key = read_storefront_config()
    script = f"""(() => {{
    'use strict';

    const CATALOG_URL = {json.dumps(supabase_url + '/rest/v1/rpc/get_storefront_catalog')};
    const SUPABASE_PUBLISHABLE_KEY = {json.dumps(publishable_key)};
    const currency = new Intl.NumberFormat('en-US', {{ style: 'currency', currency: 'USD' }});

    function isLocalPickupOnly(product) {{
        return product?.local_pickup_only === true || product?.store_category === 'feeders';
    }}

    function purchaseMode(product) {{
        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;
    }}

    function productPrice(product) {{
        const display = String(product.display_price_text || '').trim();
        if (display) return display.replace(/\\.00(?=\\s|$)/, '');
        return currency.format(Number(product.price || 0));
    }}

    function setAction(action, text, href = '') {{
        action.textContent = text;
        action.removeAttribute('aria-disabled');
        if (href) action.href = href;
        else {{
            action.removeAttribute('href');
            action.setAttribute('aria-disabled', 'true');
        }}
    }}

    function applyProduct(product) {{
        const action = document.querySelector('[data-product-action]');
        const price = document.querySelector('[data-product-price]');
        const stock = document.querySelector('[data-product-stock]');
        const notice = document.querySelector('[data-product-notice]');
        if (!action || !price || !stock || !notice) return;

        price.textContent = productPrice(product);
        stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
        stock.classList.toggle('available', Boolean(product.in_stock));

        if (!product.in_stock) {{
            notice.innerHTML = '<strong>Currently unavailable.</strong> Our inventory system reports this item as out of stock.';
            setAction(action, 'Out of Stock');
            return;
        }}

        if (purchaseMode(product) === 'checkout') {{
            notice.innerHTML = '<strong>Online checkout available.</strong> Add to Cart uses the original storefront cart and verifies current quantity limits.';
            setAction(action, 'Add to Cart', `/?add=${{encodeURIComponent(product.item_id)}}#shop`);
            return;
        }}

        if (isLocalPickupOnly(product)) {{
            notice.innerHTML = '<strong>Colorado local pickup only.</strong> Use Inquire to confirm availability, quantity, pricing, and pickup arrangements.';
        }} else {{
            notice.innerHTML = '<strong>Contact to order.</strong> Availability and fulfillment will be confirmed before payment.';
        }}
        setAction(
            action,
            'Inquire',
            `mailto:{BUSINESS_EMAIL}?subject=${{encodeURIComponent(`Inquiry about ${{product.public_name}}`)}}`
        );
    }}

    async function init() {{
        const itemId = Number(document.body.dataset.storefrontItemId);
        if (!Number.isInteger(itemId) || itemId <= 0) return;

        try {{
            const response = await fetch(CATALOG_URL, {{
                method: 'POST',
                headers: {{
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json'
                }},
                body: '{{}}'
            }});
            const products = await response.json();
            if (!response.ok || !Array.isArray(products)) throw new Error('Catalog response was invalid.');
            const product = products.find(row => Number(row.item_id) === itemId);
            if (!product) throw new Error('Product is no longer published.');
            applyProduct(product);
        }} catch (error) {{
            console.error('[product-page] catalog error', error);
        }}
    }}

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {{ once: true }});
    else init();
}})();
"""
    PRODUCT_PAGE_JS.write_text(script, encoding="utf-8")


def patch_product_pages() -> int:
    count = 0
    for path in PRODUCTS_DIR.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        item_match = re.search(r"<dt>Product ID</dt><dd>(\d+)</dd>", text)
        if not item_match:
            raise RuntimeError(f"Could not identify product ID in {path.name}")
        item_id = item_match.group(1)

        if 'src="/shop/product-page.js"' not in text:
            text = text.replace(
                "</head>",
                '  <script src="/shop/product-page.js" defer></script>\n</head>',
                1,
            )
        text = re.sub(
            r"<body(?:\s+data-storefront-item-id=\"[^\"]*\")?>",
            f'<body data-storefront-item-id="{item_id}">',
            text,
            count=1,
        )
        text = re.sub(
            r'<div class="price-line"><strong(?: data-product-price)?>(.*?)</strong><span(?: data-product-stock)? class="stock([^"]*)">(.*?)</span></div>',
            r'<div class="price-line"><strong data-product-price>\1</strong><span data-product-stock class="stock\2">\3</span></div>',
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'<p class="notice"(?: data-product-notice)?>(.*?)</p>',
            r'<p class="notice" data-product-notice>\1</p>',
            text,
            count=1,
            flags=re.DOTALL,
        )
        text = re.sub(
            r'<a class="button"(?![^>]*data-product-action)([^>]*)>',
            r'<a class="button" data-product-action\1>',
            text,
            count=1,
        )
        text = re.sub(
            r'<button type="button" class="button" disabled>Out of Stock</button>',
            '<a class="button" data-product-action aria-disabled="true">Out of Stock</a>',
            text,
            count=1,
        )

        path.write_text(text, encoding="utf-8")
        count += 1
    return count


def sync_care_guide_home() -> None:
    text = INDEX_PATH.read_text(encoding="utf-8")
    original = text

    if 'care-guides/western-hognose-snake.html' not in text:
        marker = (
            '                <a href="care-guides/rough-green-snake.html" '
            'class="guide-card" data-care="snakes" style="color:inherit;" hidden>'
        )
        if marker not in text:
            raise RuntimeError("Could not locate the Snakes care-guide section on the homepage.")
        text = text.replace(marker, WESTERN_HOGNOSE_CARD + marker, 1)

    if "data-care-reptilog-promo" not in text:
        marker = '            <div class="care-menu" aria-label="Care guide categories">'
        if marker not in text:
            raise RuntimeError("Could not locate the care-guide category menu on the homepage.")
        text = text.replace(marker, CARE_REPTILOG_PROMO + marker, 1)

    if "data-care-reptilog-footer" not in text:
        if LEGACY_CARE_GUIDE_FOOTER not in text:
            raise RuntimeError("Could not locate the existing care-guide footer callout on the homepage.")
        text = text.replace(LEGACY_CARE_GUIDE_FOOTER, CARE_REPTILOG_FOOTER, 1)

    categories = ("geckos", "skinks", "lizards", "snakes")
    labels = {
        "geckos": "Geckos",
        "skinks": "Skinks",
        "lizards": "Lizards",
        "snakes": "Snakes",
        "all": "All Guides",
    }
    counts = {
        category: len(re.findall(rf'\bdata-care="{category}"', text))
        for category in categories
    }
    counts["all"] = sum(counts.values())

    for category, label in labels.items():
        pattern = (
            rf'(<button type="button" class="care-tab(?: active)?" '
            rf'data-care-filter="{category}"[^>]*>{re.escape(label)} <span>)'
            rf'\d+(</span></button>)'
        )
        text, replacements = re.subn(
            pattern,
            lambda match, count=counts[category]: (
                f"{match.group(1)}{count}{match.group(2)}"
            ),
            text,
            count=1,
        )
        if replacements != 1:
            raise RuntimeError(f"Could not update the {label} care-guide count.")

    if text != original:
        INDEX_PATH.write_text(text, encoding="utf-8")
        print("Synced homepage care-guide cards, ReptiLog callouts, and counts.")


def validate() -> None:
    storefront = STOREFRONT_JS.read_text(encoding="utf-8")
    if "requestedValue === null ? null" not in storefront:
        raise RuntimeError("Storefront request handling was not corrected.")
    if not PRODUCT_PAGE_JS.exists():
        raise RuntimeError("Live product-page script was not created.")

    pages = list(PRODUCTS_DIR.glob("*.html"))
    if not pages:
        raise RuntimeError("No product pages were found.")
    sample = pages[0].read_text(encoding="utf-8")
    required = (
        'src="/shop/product-page.js"',
        "data-storefront-item-id=",
        "data-product-action",
        "data-product-price",
        "data-product-stock",
        "data-product-notice",
    )
    if any(value not in sample for value in required):
        raise RuntimeError("Generated product pages are missing live storefront bindings.")

    index = INDEX_PATH.read_text(encoding="utf-8")
    if 'care-guides/western-hognose-snake.html' not in index:
        raise RuntimeError("Western Hognose care guide is missing from the homepage.")
    if "data-care-reptilog-promo" not in index or "data-care-reptilog-footer" not in index:
        raise RuntimeError("ReptiLog care-guide promotion is missing from the homepage.")
    if "hundreds of reptile species profiles and care guides" not in index:
        raise RuntimeError("ReptiLog care-guide promotion copy is incomplete.")
    for category in ("geckos", "skinks", "lizards", "snakes"):
        card_count = len(re.findall(rf'\bdata-care="{category}"', index))
        count_match = re.search(
            rf'data-care-filter="{category}"[^>]*>[^<]+<span>(\d+)</span>',
            index,
        )
        if not count_match or int(count_match.group(1)) != card_count:
            raise RuntimeError(f"{category.title()} care-guide count is out of sync.")


def main() -> None:
    patch_storefront_request()
    write_live_product_script()
    count = patch_product_pages()
    sync_care_guide_home()
    validate()
    print(f"Applied live storefront bindings to {count} product pages.")


if __name__ == "__main__":
    main()