#!/usr/bin/env python3
"""Keep product galleries and full-card storefront links in generated assets."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCT_PAGE_JS = ROOT / "shop" / "product-page.js"
SEO_CSS = ROOT / "shop" / "seo.css"
STOREFRONT_CSS = ROOT / "shop" / "storefront.css"
PRODUCTS_DIR = ROOT / "products"
ASSET_VERSION = "20260729-3"

GALLERY_HELPERS = r"""
    function imageSource(value) {
        if (typeof value === 'string') return textValue(value);
        if (!value || typeof value !== 'object') return '';
        return textValue(value.url || value.public_url || value.image_url || value.src);
    }

    function prepareProductGallery(product = null) {
        const gallery = document.querySelector('.product-gallery');
        if (!gallery) return;

        const existingSources = Array.from(gallery.querySelectorAll('img'))
            .map(image => image.getAttribute('src'))
            .filter(Boolean);
        const catalogSources = Array.isArray(product?.image_urls) ? product.image_urls : [];
        const sources = Array.from(new Set(
            [...catalogSources, product?.image_url, ...existingSources]
                .map(imageSource)
                .filter(Boolean)
        ));
        if (sources.length === 0) sources.push('/images/Logo.svg');

        const productName = textValue(product?.public_name)
            || textValue(document.querySelector('.product-detail-copy h1')?.textContent)
            || 'Product';
        const failed = new Set();
        const thumbnailButtons = [];

        const mainFrame = document.createElement('div');
        mainFrame.className = 'product-gallery-main';

        const mainImage = document.createElement('img');
        mainImage.className = 'product-gallery-main-image';
        mainImage.loading = 'eager';
        mainImage.decoding = 'async';
        mainFrame.appendChild(mainImage);

        const thumbnails = document.createElement('div');
        thumbnails.className = 'product-gallery-thumbnails';
        thumbnails.setAttribute('role', 'list');
        thumbnails.setAttribute('aria-label', `${productName} images`);

        gallery.replaceChildren(mainFrame);
        gallery.classList.toggle('has-thumbnails', sources.length > 1);
        if (sources.length > 1) gallery.appendChild(thumbnails);

        function showFallback() {
            gallery.classList.remove('has-thumbnails');
            thumbnails.remove();
            mainImage.removeAttribute('data-image-index');
            mainImage.alt = `${productName} image unavailable`;
            mainImage.src = '/images/Logo.svg';
        }

        function activate(index) {
            if (!Number.isInteger(index) || index < 0 || index >= sources.length || failed.has(index)) {
                return;
            }
            mainImage.dataset.imageIndex = String(index);
            mainImage.alt = `${productName} product image ${index + 1} of ${sources.length}`;
            mainImage.src = sources[index];
            thumbnailButtons.forEach((button, buttonIndex) => {
                button.setAttribute('aria-pressed', buttonIndex === index ? 'true' : 'false');
            });
        }

        function activateNextAvailable() {
            const nextIndex = sources.findIndex((_, index) => !failed.has(index));
            if (nextIndex === -1) showFallback();
            else activate(nextIndex);
        }

        sources.forEach((source, index) => {
            if (sources.length <= 1) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'product-gallery-thumbnail';
            button.setAttribute('role', 'listitem');
            button.setAttribute('aria-label', `View ${productName} image ${index + 1}`);
            button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');

            const image = document.createElement('img');
            image.src = source;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                if (failed.has(index)) return;
                failed.add(index);
                button.remove();
                if (Number(mainImage.dataset.imageIndex) === index) activateNextAvailable();
            }, { once: true });

            button.appendChild(image);
            button.addEventListener('click', () => activate(index));
            thumbnailButtons.push(button);
            thumbnails.appendChild(button);
        });

        mainImage.addEventListener('error', () => {
            const failedIndex = Number(mainImage.dataset.imageIndex);
            if (Number.isInteger(failedIndex)) {
                failed.add(failedIndex);
                thumbnailButtons[failedIndex]?.remove();
            }
            activateNextAvailable();
        });

        activate(0);
    }
"""

GALLERY_CSS = r"""
/* Product image gallery */
.product-gallery { display: block; min-width: 0; }
.product-gallery.has-thumbnails {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: .85rem;
  align-items: start;
}
.product-gallery-main {
  display: grid;
  grid-column: 1 / -1;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #f7f3e9;
}
.product-gallery.has-thumbnails .product-gallery-main {
  grid-column: 2;
  grid-row: 1;
}
.product-gallery-main .product-gallery-main-image {
  width: 100%;
  height: 100%;
  max-height: none;
  aspect-ratio: auto;
  object-fit: contain;
  padding: .5rem;
  border-radius: 0;
  background: transparent;
}
.product-gallery-thumbnails {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  flex-direction: column;
  gap: .6rem;
  max-height: min(70vh, 620px);
  overflow-y: auto;
  padding: 2px;
}
.product-gallery-thumbnail {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  padding: .2rem;
  border: 2px solid transparent;
  border-radius: 10px;
  background: #f7f3e9;
  cursor: pointer;
}
.product-gallery-thumbnail:hover {
  border-color: rgba(158, 20, 3, .45);
}
.product-gallery-thumbnail[aria-pressed="true"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(158, 20, 3, .12);
}
.product-gallery-thumbnail:focus-visible {
  outline: 3px solid rgba(158, 20, 3, .25);
  outline-offset: 2px;
}
.product-gallery-thumbnail img {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  object-fit: contain;
  padding: 0;
  border-radius: 6px;
  background: transparent;
}
@media (max-width: 760px) {
  .product-gallery.has-thumbnails {
    grid-template-columns: 1fr;
  }
  .product-gallery.has-thumbnails .product-gallery-main {
    grid-column: 1;
    grid-row: 1;
  }
  .product-gallery-thumbnails {
    grid-column: 1;
    grid-row: 2;
    flex-direction: row;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .product-gallery-thumbnail {
    flex: 0 0 72px;
  }
}
"""

CARD_LINK_CSS = r"""
/* Full product card links */
#page-shop .product-card[data-storefront-item-id] {
    position: relative;
    transition: transform .18s ease, box-shadow .18s ease;
}
#page-shop .product-card[data-storefront-item-id]:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgba(26, 26, 26, .13);
}
#page-shop .product-card[data-storefront-item-id] .storefront-product-link::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
}
#page-shop .product-card[data-storefront-item-id] .storefront-product-link:focus-visible::after {
    outline: 3px solid rgba(158, 20, 3, .28);
    outline-offset: 3px;
}
#page-shop .product-card[data-storefront-item-id] [data-storefront-action] {
    position: relative;
    z-index: 2;
}
"""


def patch_product_script() -> bool:
    text = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
    original = text

    if "function prepareProductGallery(" not in text:
        marker = "    function applyProduct(product, layout) {"
        if marker not in text:
            raise RuntimeError("Could not locate product application function.")
        text = text.replace(marker, GALLERY_HELPERS.rstrip() + "\n\n" + marker, 1)

    apply_marker = "    function applyProduct(product, layout) {\n"
    if "function applyProduct(product, layout) {\n        prepareProductGallery(product);" not in text:
        if apply_marker not in text:
            raise RuntimeError("Could not connect live gallery data.")
        text = text.replace(apply_marker, apply_marker + "        prepareProductGallery(product);\n", 1)

    init_marker = "        const layout = prepareDescriptionLayout();\n"
    if "        prepareProductGallery();\n" not in text:
        if init_marker not in text:
            raise RuntimeError("Could not initialize the static gallery.")
        text = text.replace(init_marker, init_marker + "        prepareProductGallery();\n", 1)

    if text != original:
        PRODUCT_PAGE_JS.write_text(text, encoding="utf-8")
        return True
    return False


def patch_product_pages() -> int:
    changed = 0
    pattern = re.compile(r'/shop/product-page\.js(?:\?v=[^"]*)?')
    replacement = f"/shop/product-page.js?v={ASSET_VERSION}"
    for path in PRODUCTS_DIR.glob("*.html"):
        text = path.read_text(encoding="utf-8")
        updated = pattern.sub(replacement, text, count=1)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    return changed


def append_rules(path: Path, marker: str, rules: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return False
    path.write_text(text.rstrip() + "\n\n" + rules.strip() + "\n", encoding="utf-8")
    return True


def validate() -> None:
    product_script = PRODUCT_PAGE_JS.read_text(encoding="utf-8")
    for marker in (
        "function prepareProductGallery(",
        "prepareProductGallery(product);",
        "prepareProductGallery();",
        "product-gallery-thumbnail",
    ):
        if marker not in product_script:
            raise RuntimeError(f"Product gallery script is missing {marker}")

    if "/* Product image gallery */" not in SEO_CSS.read_text(encoding="utf-8"):
        raise RuntimeError("Product gallery CSS was not installed.")
    if "/* Full product card links */" not in STOREFRONT_CSS.read_text(encoding="utf-8"):
        raise RuntimeError("Full-card storefront link CSS was not installed.")

    pages = list(PRODUCTS_DIR.glob("*.html"))
    if pages and any(f"/shop/product-page.js?v={ASSET_VERSION}" not in path.read_text(encoding="utf-8") for path in pages):
        raise RuntimeError("One or more product pages still use the previous product asset version.")


def main() -> None:
    script_changed = patch_product_script()
    pages_changed = patch_product_pages()
    gallery_css_changed = append_rules(SEO_CSS, "/* Product image gallery */", GALLERY_CSS)
    card_css_changed = append_rules(STOREFRONT_CSS, "/* Full product card links */", CARD_LINK_CSS)
    validate()
    print(
        "Installed product gallery and full-card links: "
        f"script={script_changed}, pages={pages_changed}, "
        f"gallery_css={gallery_css_changed}, card_css={card_css_changed}."
    )


if __name__ == "__main__":
    main()
