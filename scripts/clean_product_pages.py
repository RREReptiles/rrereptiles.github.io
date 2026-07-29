#!/usr/bin/env python3
"""Clean generated product pages and keep them in the full website shell."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_DIR = ROOT / "products"
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"

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

FULL_HEADER = """<header class="site-header">
    <div class="nav-container">
        <a href="/#home" class="logo" aria-label="Go to Home page">
            <div class="logo-icon"><img src="/images/Logo.svg" alt="RRE Logo"></div>
            <span><span class="accent">Red Rocks</span> Exotic Reptiles</span>
        </a>
        <nav class="nav-links" aria-label="Primary navigation">
            <a href="/#home">Home</a>
            <a href="/#shop" class="active" aria-current="page">Shop</a>
            <a href="/#about">About Us</a>
            <a href="/#socials">Socials</a>
            <a href="/#reptilog">ReptiLog</a>
            <a href="/#care">Care Guides</a>
            <a href="/#faq">Shipping/FAQs</a>
        </nav>
        <button class="hamburger" id="hamburger" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="mobileNav">
            <span></span><span></span><span></span>
        </button>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="Mobile navigation">
        <a href="/#home">Home</a>
        <a href="/#shop" class="active" aria-current="page">Shop</a>
        <a href="/#about">About Us</a>
        <a href="/#socials">Socials</a>
        <a href="/#reptilog">ReptiLog</a>
        <a href="/#care">Care Guides</a>
        <a href="/#faq">Shipping/FAQs</a>
    </nav>
</header>"""

FULL_FOOTER = """<footer class="site-footer">
    <div class="footer-grid">
        <div>
            <h4 style="color:var(--accent);">Red Rocks Exotic Reptiles</h4>
            <p>Colorado's source for ethically bred reptiles, aquatic plants, and custom reptile goods. Woman, Veteran, Hispanic &amp; Native American owned.</p>
        </div>
        <div>
            <h4>Quick Links</h4>
            <a href="/#home">Home</a><br>
            <a href="/#shop">Shop</a><br>
            <a href="/#about">About Us</a><br>
            <a href="/#care">Care Guides</a><br>
            <a href="/#faq">Shipping/FAQs</a><br>
            <a href="/#faq">Store Policies</a><br>
            <a href="/#faq">Privacy Policy</a>
        </div>
        <div>
            <h4>Contact Us</h4>
            <p>
                <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a><br>
                <a href="tel:9704001278">970-400-1278</a>
            </p>
        </div>
        <div>
            <h4>Follow Us</h4>
            <a href="https://www.instagram.com/red_rocks_reptiles/" target="_blank" rel="noopener">Instagram</a><br>
            <a href="https://www.facebook.com/RREReptiles" target="_blank" rel="noopener">Facebook</a><br>
            <a href="https://www.tiktok.com/@redrocks_exotic_reptiles" target="_blank" rel="noopener">TikTok</a><br>
            <a href="https://www.youtube.com/@RedRocksExoticReptiles" target="_blank" rel="noopener">YouTube</a><br>
            <a href="https://www.morphmarket.com/stores/red_rocks_exotic_reptiles/" target="_blank" rel="noopener">MorphMarket</a>
        </div>
    </div>
    <div class="footer-bottom">
        <p>&copy; 2023&ndash;2026 Red Rocks Exotic Reptiles LLC. All rights reserved.</p>
    </div>
</footer>"""


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


def install_full_site_shell(text: str, path: Path) -> str:
    text, header_count = re.subn(
        r"<header\b[^>]*>.*?</header>",
        FULL_HEADER,
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    text, footer_count = re.subn(
        r"<footer\b[^>]*>.*?</footer>",
        FULL_FOOTER,
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if header_count != 1 or footer_count != 1:
        raise RuntimeError(f"Could not install the complete site shell for {path.name}")
    return text


def clean_product_page(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    text = preserve_hidden_item_id(text, path)
    text = install_full_site_shell(text, path)

    text = re.sub(
        r'\s*<dl class="details-list">.*?</dl>',
        "",
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
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


def patch_product_script_shell() -> bool:
    text = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
    original = text

    if "function renderSiteShell()" not in text:
        shell_script = f"""
    const SITE_HEADER = {json.dumps(FULL_HEADER)};
    const SITE_FOOTER = {json.dumps(FULL_FOOTER)};

    function renderSiteShell() {{
        const header = document.querySelector('body > header');
        const footer = document.querySelector('body > footer');
        if (header) header.outerHTML = SITE_HEADER;
        if (footer) footer.outerHTML = SITE_FOOTER;

        const hamburger = document.getElementById('hamburger');
        const mobileNav = document.getElementById('mobileNav');
        if (!hamburger || !mobileNav) return;

        function setOpen(open) {{
            hamburger.classList.toggle('open', open);
            mobileNav.classList.toggle('show', open);
            hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }}

        hamburger.addEventListener('click', () => {{
            setOpen(!mobileNav.classList.contains('show'));
        }});
        mobileNav.querySelectorAll('a').forEach(link => {{
            link.addEventListener('click', () => setOpen(false));
        }});
        document.addEventListener('keydown', event => {{
            if (event.key === 'Escape') setOpen(false);
        }});
    }}

"""
        marker = "    function textValue(value) {"
        if marker not in text:
            raise RuntimeError("Could not locate the product-page script insertion point")
        text = text.replace(marker, shell_script + marker, 1)

    if "renderSiteShell();" not in text:
        marker = "    async function init() {\n        const layout = prepareDescriptionLayout();"
        replacement = "    async function init() {\n        renderSiteShell();\n        const layout = prepareDescriptionLayout();"
        if marker not in text:
            raise RuntimeError("Could not connect the product-page site shell")
        text = text.replace(marker, replacement, 1)

    if text != original:
        PRODUCT_PAGE_JS.write_text(text, encoding="utf-8")
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
        '<a class="brand"',
    )
    required_shell = (
        '<div class="nav-container">',
        '<nav class="nav-links"',
        '<a href="/#shop" class="active" aria-current="page">Shop</a>',
        'class="hamburger" id="hamburger"',
        '<nav class="mobile-nav" id="mobileNav"',
        '<div class="footer-grid">',
        '<h4>Quick Links</h4>',
        '<h4>Contact Us</h4>',
        '<h4>Follow Us</h4>',
        '>Instagram</a>',
        '>MorphMarket</a>',
        '<div class="footer-bottom">',
    )

    for path in pages:
        text = path.read_text(encoding="utf-8")
        if not re.search(r'<body[^>]*\bdata-storefront-item-id="\d+"', text):
            failures.append(f"{path.name}: missing hidden product binding")
        for value in forbidden:
            if value.lower() in text.lower():
                failures.append(f"{path.name}: contains {value}")
        for value in required_shell:
            if value not in text:
                failures.append(f"{path.name}: missing site shell marker {value}")

    supporting_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "index.html", ROOT / "llms.txt")
        if path.exists()
    ).lower()
    if "original website" in supporting_text:
        failures.append("supporting website copy still says original website")

    site_shell = ROOT / "shop" / "site-shell.css"
    seo_css = ROOT / "shop" / "seo.css"
    if not site_shell.exists():
        failures.append("missing shared site shell stylesheet")
    if not seo_css.exists() or '@import url("/shop/site-shell.css");' not in seo_css.read_text(encoding="utf-8"):
        failures.append("product stylesheet does not load the shared site shell")
    if not PRODUCT_PAGE_JS.exists():
        failures.append("missing product-page script")
    else:
        product_script = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
        for marker in ("function renderSiteShell()", "renderSiteShell();", "SITE_HEADER", "SITE_FOOTER"):
            if marker not in product_script:
                failures.append(f"product script is missing {marker}")

    if failures:
        raise RuntimeError("Product-page cleanup failed: " + "; ".join(failures))


def main() -> None:
    changed_pages = sum(clean_product_page(path) for path in PRODUCTS_DIR.glob("*.html"))
    changed_script = patch_product_script_shell()
    changed_supporting = clean_supporting_copy()
    validate()
    print(
        f"Cleaned customer-facing product details on {changed_pages} product pages, "
        f"updated the product shell script={changed_script}, and changed "
        f"{changed_supporting} supporting files."
    )


if __name__ == "__main__":
    main()
