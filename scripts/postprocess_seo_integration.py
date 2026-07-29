#!/usr/bin/env python3
"""Apply live our inventory system behavior to generated product detail pages."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STOREFRONT_JS = ROOT / "shop" / "storefront.js"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
PRODUCTS_DIR = ROOT / "products"
BUSINESS_EMAIL = "rrereptiles@gmail.com"


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


def main() -> None:
    patch_storefront_request()
    write_live_product_script()
    count = patch_product_pages()
    validate()
    print(f"Applied live storefront bindings to {count} product pages.")


if __name__ == "__main__":
    main()
