(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const PLACEHOLDER_IMAGE = 'images/Logo.svg';
    const currency = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });
    const STATIC_NAME_ALIASES = new Map([
        ['small metal tongs', 'metal tongs'],
        ['round flat hide', 'flat hides']
    ]);

    let productsByItemId = new Map();
    let productsByName = new Map();
    let applyTimer = null;
    let refreshPromise = null;

    function normalizeName(value) {
        return String(value || '')
            .toLowerCase()
            .replaceAll('&', 'and')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function matchingName(value) {
        const normalized = normalizeName(value);
        return STATIC_NAME_ALIASES.get(normalized) || normalized;
    }

    function customDisplayPrice(product) {
        const display = String(product.display_price_text || '').trim();
        if (!display) return '';

        // A plain stored amount becomes stale when ReptiTrax changes the price.
        // Keep only genuinely custom labels such as ranges or "starting at" text.
        const isSingleAmount = /^\$?\s*\d[\d,]*(?:\.\d{1,2})?\s*$/.test(display);
        return isSingleAmount ? '' : display.replace(/\.00(?=\s|$)/g, '');
    }

    function productPrice(product) {
        return customDisplayPrice(product)
            || currency.format(Number(product.price || 0));
    }

    function scheduleApply() {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(applyCatalogState, 40);
    }

    function replaceCarouselWithImage(card, src, alt) {
        const carousel = card.querySelector('.product-carousel');
        if (!carousel) return null;

        const image = document.createElement('img');
        image.src = src;
        image.alt = alt;
        image.className = 'product-img';
        image.loading = 'lazy';
        image.decoding = 'async';
        carousel.replaceWith(image);
        return image;
    }

    function productForCard(card) {
        const itemId = Number(card.dataset.storefrontItemId);
        if (Number.isInteger(itemId) && productsByItemId.has(itemId)) {
            return productsByItemId.get(itemId);
        }

        const title = card.querySelector('.product-info h3, h3')?.textContent;
        return productsByName.get(matchingName(title)) || null;
    }

    function applyProductPhoto(card, product) {
        const photoUrl = String(product.image_url || '').trim();
        const alt = product.public_name || 'Product photo';
        let existingImage = card.querySelector('img.product-img');

        if (!photoUrl) {
            existingImage = replaceCarouselWithImage(card, PLACEHOLDER_IMAGE, alt)
                || existingImage;
            if (existingImage && existingImage.getAttribute('src') !== PLACEHOLDER_IMAGE) {
                existingImage.src = PLACEHOLDER_IMAGE;
                existingImage.alt = alt;
            }
            return;
        }

        existingImage = replaceCarouselWithImage(card, photoUrl, alt)
            || existingImage;
        if (existingImage) {
            if (existingImage.getAttribute('src') !== photoUrl) {
                existingImage.src = photoUrl;
            }
            existingImage.alt = alt;
            return;
        }

        const placeholder = card.querySelector('div.product-img');
        if (!placeholder) return;

        const image = document.createElement('img');
        image.src = photoUrl;
        image.alt = alt;
        image.className = 'product-img';
        image.loading = 'lazy';
        image.decoding = 'async';
        placeholder.replaceWith(image);
    }

    function applyCatalogState() {
        document.querySelectorAll('#page-shop .shop-category .product-card').forEach(card => {
            const product = productForCard(card);
            const isGenerated = card.hasAttribute('data-storefront-generated');

            if (!product) {
                if (isGenerated) card.remove();
                else card.hidden = true;
                return;
            }

            card.hidden = false;
            card.dataset.storefrontItemId = String(product.item_id);

            const price = card.querySelector('.product-info .price, .price');
            const nextPrice = productPrice(product);
            if (price && price.textContent !== nextPrice) price.textContent = nextPrice;

            applyProductPhoto(card, product);
        });
    }

    async function refresh({ refreshStorefront = true } = {}) {
        if (refreshPromise) return refreshPromise;

        refreshPromise = (async () => {
            try {
                const response = await fetch(CATALOG_URL, {
                    method: 'POST',
                    headers: {
                        apikey: SUPABASE_PUBLISHABLE_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: '{}',
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);

                const products = await response.json();
                const catalog = Array.isArray(products) ? products : [];
                productsByItemId = new Map(
                    catalog.map(product => [Number(product.item_id), product])
                );
                productsByName = new Map(
                    catalog.map(product => [matchingName(product.public_name), product])
                );

                if (refreshStorefront && window.RREStorefront?.refresh) {
                    await window.RREStorefront.refresh();
                }
                applyCatalogState();
            } catch (error) {
                console.warn('[storefront] item catalog sync unavailable', error);
            } finally {
                refreshPromise = null;
            }
        })();

        return refreshPromise;
    }

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('focus', () => refresh());
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });

    window.RREStorefrontPhotos = { refresh };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
    } else {
        refresh();
    }
})();
