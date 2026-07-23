(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const PLACEHOLDER_IMAGE = 'images/Logo.svg';

    let photosByItemId = new Map();
    let applyTimer = null;

    function scheduleApply() {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(applyPhotos, 40);
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

    function applyPhotos() {
        document.querySelectorAll('#page-shop [data-storefront-item-id]').forEach(card => {
            const itemId = Number(card.dataset.storefrontItemId);
            const product = photosByItemId.get(itemId);
            if (!product) return;

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
        });
    }

    async function refresh() {
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
            photosByItemId = new Map(
                (Array.isArray(products) ? products : []).map(product => [Number(product.item_id), product])
            );
            applyPhotos();
        } catch (error) {
            console.warn('[storefront] item photo sync unavailable', error);
        }
    }

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.RREStorefrontPhotos = { refresh };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
        refresh();
    }
})();
