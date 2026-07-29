#!/usr/bin/env python3
"""Use the catalog product description as the highlighted product-page copy."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_DIR = ROOT / "products"
STOREFRONT_JS = ROOT / "shop" / "storefront.js"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
SEO_CSS = ROOT / "shop" / "seo.css"
BUSINESS_EMAIL = "rrereptiles@gmail.com"
ASSET_VERSION = "20260729-2"


def read_storefront_config() -> tuple[str, str]:
    text = STOREFRONT_JS.read_text(encoding="utf-8")
    url_match = re.search(r"const SUPABASE_URL = '([^']+)'", text)
    key_match = re.search(r"const SUPABASE_PUBLISHABLE_KEY = '([^']+)'", text)
    if not url_match or not key_match:
        raise RuntimeError("Could not read public storefront configuration.")
    return url_match.group(1), key_match.group(1)


def write_product_script() -> None:
    supabase_url, publishable_key = read_storefront_config()
    script = f"""(() => {{
    'use strict';

    const CATALOG_URL = {json.dumps(supabase_url + '/rest/v1/rpc/get_storefront_catalog')};
    const SUPABASE_PUBLISHABLE_KEY = {json.dumps(publishable_key)};
    const currency = new Intl.NumberFormat('en-US', {{ style: 'currency', currency: 'USD' }});

    function textValue(value) {{
        return String(value ?? '').trim();
    }}

    function isLocalPickupOnly(product) {{
        return product?.local_pickup_only === true || product?.store_category === 'feeders';
    }}

    function purchaseMode(product) {{
        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;
    }}

    function productPrice(product) {{
        const display = textValue(product.display_price_text);
        if (display) return display.replace(/\\.00(?=\\s|$)/, '');
        return currency.format(Number(product.price || 0));
    }}

    function setVisibleText(element, value) {{
        if (!element) return;
        const text = textValue(value);
        element.textContent = text;
        element.hidden = !text;
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

    function prepareDescriptionLayout() {{
        const copy = document.querySelector('.product-detail-copy');
        const legacyLead = copy?.querySelector('.lead');
        const legacyNotice = copy?.querySelector('[data-product-notice]');
        let shortDescription = copy?.querySelector('[data-product-short-description]');
        let description = copy?.querySelector('[data-product-description]');
        let fulfillment = copy?.querySelector('[data-product-fulfillment]');

        if (!description && legacyNotice) {{
            description = legacyNotice;
            description.removeAttribute('data-product-notice');
            description.setAttribute('data-product-description', '');
            const fallback = textValue(legacyLead?.textContent)
                || textValue(document.querySelector('meta[name=\"description\"]')?.content);
            setVisibleText(description, fallback);
        }}

        if (!shortDescription && legacyLead) {{
            shortDescription = legacyLead;
            shortDescription.setAttribute('data-product-short-description', '');
            shortDescription.hidden = true;
        }}

        if (!fulfillment && description) {{
            fulfillment = document.createElement('p');
            fulfillment.className = 'product-fulfillment';
            fulfillment.setAttribute('data-product-fulfillment', '');
            fulfillment.hidden = true;
            description.insertAdjacentElement('afterend', fulfillment);
        }}

        return {{ shortDescription, description, fulfillment }};
    }}

    function applyProduct(product, layout) {{
        const action = document.querySelector('[data-product-action]');
        const price = document.querySelector('[data-product-price]');
        const stock = document.querySelector('[data-product-stock]');
        const {{ shortDescription, description, fulfillment }} = layout;
        if (!action || !price || !stock || !description) return;

        const fullDescription = textValue(product.description);
        const shortCopy = textValue(product.short_description);
        const fallbackDescription = textValue(description.textContent)
            || textValue(document.querySelector('meta[name=\"description\"]')?.content);

        setVisibleText(description, fullDescription || fallbackDescription);
        setVisibleText(shortDescription, shortCopy && shortCopy !== fullDescription ? shortCopy : '');

        price.textContent = productPrice(product);
        stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
        stock.classList.toggle('available', Boolean(product.in_stock));

        if (!product.in_stock) {{
            setVisibleText(fulfillment, '');
            setAction(action, 'Out of Stock');
            return;
        }}

        if (purchaseMode(product) === 'checkout') {{
            setVisibleText(fulfillment, '');
            setAction(action, 'Add to Cart', `/?add=${{encodeURIComponent(product.item_id)}}#shop`);
            return;
        }}

        if (isLocalPickupOnly(product)) {{
            setVisibleText(fulfillment, 'Colorado local pickup only. Contact us to arrange pickup.');
        }} else {{
            setVisibleText(fulfillment, 'Contact us to confirm availability and ordering details.');
        }}
        setAction(
            action,
            'Inquire',
            `mailto:{BUSINESS_EMAIL}?subject=${{encodeURIComponent(`Inquiry about ${{product.public_name}}`)}}`
        );
    }}

    async function init() {{
        const layout = prepareDescriptionLayout();
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
            applyProduct(product, layout);
        }} catch (error) {{
            console.error('[product-page] catalog error', error);
        }}
    }}

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {{ once: true }});
    else init();
}})();
"""
    PRODUCT_PAGE_JS.write_text(script, encoding="utf-8")


def current_description(text: str) -> str:
    bound = re.search(
        r'<p class="notice"[^>]*data-product-description[^>]*>(.*?)</p>',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if bound:
        return bound.group(1).strip()
    lead = re.search(r'<p class="lead"[^>]*>(.*?)</p>', text, flags=re.DOTALL | re.IGNORECASE)
    return lead.group(1).strip() if lead else ""


def current_fulfillment(text: str) -> str:
    bound = re.search(
        r'<p class="product-fulfillment"[^>]*>(.*?)</p>',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if bound:
        return bound.group(1).strip()
    notice = re.search(
        r'<p class="notice"[^>]*data-product-notice[^>]*>(.*?)</p>',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not notice:
        return ""
    value = notice.group(1).strip()
    plain = re.sub(r"<[^>]+>", " ", value).casefold()
    if "local pickup only" in plain or "contact to order" in plain:
        return value
    return ""


def patch_product_page(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    description = current_description(text)
    fulfillment = current_fulfillment(text)

    text = re.sub(
        r'<script src="/shop/product-page\.js(?:\?[^\"]*)?" defer></script>',
        f'<script src="/shop/product-page.js?v={ASSET_VERSION}" defer></script>',
        text,
        count=1,
    )

    lead_tag = '<p class="lead" data-product-short-description hidden></p>'
    if re.search(r'<p class="lead"[^>]*>.*?</p>', text, flags=re.DOTALL | re.IGNORECASE):
        text = re.sub(
            r'<p class="lead"[^>]*>.*?</p>',
            lead_tag,
            text,
            count=1,
            flags=re.DOTALL | re.IGNORECASE,
        )
    else:
        text = text.replace("</h1>", f"</h1>\n      {lead_tag}", 1)

    description_tag = f'<p class="notice" data-product-description>{description}</p>'
    fulfillment_tag = (
        f'<p class="product-fulfillment" data-product-fulfillment>{fulfillment}</p>'
        if fulfillment
        else '<p class="product-fulfillment" data-product-fulfillment hidden></p>'
    )
    replacement = description_tag + "\n      " + fulfillment_tag
    notice_pattern = (
        r'<p class="notice"[^>]*(?:data-product-notice|data-product-description)[^>]*>.*?</p>'
        r'(?:\s*<p class="product-fulfillment"[^>]*>.*?</p>)?'
    )
    if re.search(notice_pattern, text, flags=re.DOTALL | re.IGNORECASE):
        text = re.sub(
            notice_pattern,
            replacement,
            text,
            count=1,
            flags=re.DOTALL | re.IGNORECASE,
        )
    else:
        text = text.replace('<div class="price-line">', replacement + '\n      <div class="price-line">', 1)

    text = re.sub(
        r'<strong>Currently unavailable\.</strong>.*?out of stock\.',
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = text.replace(
        "Add to Cart uses the original storefront cart and verifies current quantity limits.",
        "",
    )

    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def patch_css() -> bool:
    text = SEO_CSS.read_text(encoding="utf-8")
    original = text
    rules = (
        ".product-fulfillment { color: var(--muted); font-size: .92rem; margin: .35rem 0 .2rem; }\n"
        ".notice[hidden], .product-fulfillment[hidden], .lead[hidden] { display: none; }"
    )
    if ".product-fulfillment {" not in text:
        text = text.replace(
            ".notice { background: #f7f3e9; border-left: 4px solid var(--accent); padding: .85rem 1rem; border-radius: 7px; }",
            ".notice { background: #f7f3e9; border-left: 4px solid var(--accent); padding: .85rem 1rem; border-radius: 7px; }\n" + rules,
            1,
        )
    if text != original:
        SEO_CSS.write_text(text, encoding="utf-8")
        return True
    return False


def validate() -> None:
    pages = list(PRODUCTS_DIR.glob("*.html"))
    if not pages:
        raise RuntimeError("No generated product pages were found.")

    forbidden = (
        "reports this item as out of stock",
        "Currently unavailable.",
        "data-product-notice",
    )
    failures: list[str] = []
    for path in pages:
        text = path.read_text(encoding="utf-8")
        for value in (
            f'/shop/product-page.js?v={ASSET_VERSION}',
            "data-product-short-description",
            "data-product-description",
            "data-product-fulfillment",
        ):
            if value not in text:
                failures.append(f"{path.name}: missing {value}")
        for value in forbidden:
            if value.casefold() in text.casefold():
                failures.append(f"{path.name}: contains {value}")

    script = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
    for value in forbidden:
        if value.casefold() in script.casefold():
            failures.append(f"shop/product-page.js: contains {value}")
    for value in ("product.description", "product.short_description", "data-product-description"):
        if value not in script:
            failures.append(f"shop/product-page.js: missing {value}")

    if failures:
        raise RuntimeError("Product-description wiring failed: " + "; ".join(failures))


def main() -> None:
    write_product_script()
    changed_pages = sum(patch_product_page(path) for path in PRODUCTS_DIR.glob("*.html"))
    changed_css = patch_css()
    validate()
    print(
        f"Wired product descriptions on {changed_pages} product pages; "
        f"CSS changed: {changed_css}."
    )


if __name__ == "__main__":
    main()
