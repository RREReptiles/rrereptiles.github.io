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
    const STATIC_DETAIL_PATHS = new Map([
        ['potato', '/products/potato-crested-gecko.html']
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

    function cardTitle(card) {
        return card.querySelector('.product-info h3, h3')?.textContent?.trim() || 'Product';
    }

    function staticDetailPath(card) {
        return STATIC_DETAIL_PATHS.get(matchingName(cardTitle(card))) || '';
    }

    function productDetailPath(product, card) {
        const staticPath = staticDetailPath(card);
        if (!product && staticPath) return staticPath;

        const slug = String(product?.slug || '').trim();
        if (!slug) return staticPath;
        return `/product.html?slug=${encodeURIComponent(slug)}`;
    }

    function customDisplayPrice(product) {
        const display = String(product.display_price_text || '').trim();
        if (!display) return '';

        const isSingleAmount = /^\$?\s*\d[\d,]*(?:\.\d{1,2})?\s*$/.test(display);
        return isSingleAmount ? '' : display.replace(/\.00(?=\s|$)/g, '');
    }

    function productPrice(product) {
        return customDisplayPrice(product)
            || currency.format(Number(product.price || 0));
    }

    function productImages(product) {
        const configured = Array.isArray(product?.image_urls)
            ? product.image_urls
            : [];
        const candidates = [
            ...configured,
            product?.image_url
        ];
        const unique = [];
        const seen = new Set();

        candidates.forEach(value => {
            const source = typeof value === 'object' && value
                ? value.url || value.public_url || value.image_url || value.src
                : value;
            const url = String(source || '').trim();
            if (!url || seen.has(url)) return;
            seen.add(url);
            unique.push(url);
        });

        return unique.length > 0 ? unique : [PLACEHOLDER_IMAGE];
    }

    function installCarouselStyles() {
        if (document.querySelector('style[data-storefront-product-carousel-styles]')) return;
        const style = document.createElement('style');
        style.dataset.storefrontProductCarouselStyles = '';
        style.textContent = `
            #page-shop .storefront-product-carousel {
                position: relative;
                width: 100%;
                overflow: hidden;
                background: var(--light-gray, #f3f1ec);
            }

            #page-shop .storefront-product-carousel > img.product-img {
                display: block;
                width: 100%;
            }

            #page-shop .storefront-product-carousel-button {
                position: absolute;
                top: 50%;
                z-index: 3;
                display: grid;
                place-items: center;
                width: 36px;
                height: 36px;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, .72);
                border-radius: 50%;
                background: rgba(22, 22, 22, .66);
                box-shadow: 0 4px 14px rgba(0, 0, 0, .2);
                color: #fff;
                cursor: pointer;
                font: inherit;
                font-size: 1.55rem;
                line-height: 1;
                opacity: 0;
                transform: translateY(-50%);
                transition: opacity .18s ease, background .18s ease, transform .18s ease;
            }

            #page-shop .storefront-product-carousel-button.previous { left: 10px; }
            #page-shop .storefront-product-carousel-button.next { right: 10px; }

            #page-shop .storefront-product-carousel:hover .storefront-product-carousel-button,
            #page-shop .storefront-product-carousel:focus-within .storefront-product-carousel-button {
                opacity: 1;
            }

            #page-shop .storefront-product-carousel-button:hover {
                background: rgba(158, 20, 3, .88);
            }

            #page-shop .storefront-product-carousel-button:focus-visible,
            #page-shop .storefront-product-carousel:focus-visible {
                outline: 3px solid rgba(158, 20, 3, .32);
                outline-offset: 2px;
            }

            #page-shop .storefront-product-carousel-count {
                position: absolute;
                right: 10px;
                bottom: 10px;
                z-index: 2;
                padding: .24rem .48rem;
                border-radius: 999px;
                background: rgba(22, 22, 22, .68);
                color: #fff;
                font-size: .66rem;
                font-weight: 800;
                letter-spacing: .02em;
                pointer-events: none;
            }

            #page-shop .product-card[data-storefront-detail-url] {
                cursor: pointer;
            }

            #page-shop .product-card[data-storefront-detail-url] .storefront-product-link::after {
                content: none !important;
                display: none !important;
            }

            @media (hover: none), (pointer: coarse) {
                #page-shop .storefront-product-carousel-button {
                    width: 34px;
                    height: 34px;
                    opacity: .9;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #page-shop .storefront-product-carousel-button {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function scheduleApply() {
        window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(applyCatalogState, 40);
    }

    function createProductImage(src, alt) {
        const image = document.createElement('img');
        image.src = src;
        image.alt = alt;
        image.className = 'product-img';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
            if (image.getAttribute('src') === PLACEHOLDER_IMAGE) return;
            image.src = PLACEHOLDER_IMAGE;
        });
        return image;
    }

    function imageTarget(card) {
        return card.querySelector('[data-storefront-product-carousel]')
            || card.querySelector('.product-carousel')
            || card.querySelector('img.product-img')
            || card.querySelector('div.product-img');
    }

    function applySinglePhoto(card, src, alt) {
        const dynamicCarousel = card.querySelector('[data-storefront-product-carousel]');
        if (dynamicCarousel) {
            dynamicCarousel.replaceWith(createProductImage(src, alt));
            return;
        }

        const staticCarousel = card.querySelector('.product-carousel');
        if (staticCarousel) {
            staticCarousel.replaceWith(createProductImage(src, alt));
            return;
        }

        const existingImage = card.querySelector('img.product-img');
        if (existingImage) {
            if (existingImage.getAttribute('src') !== src) existingImage.src = src;
            existingImage.alt = alt;
            existingImage.loading = 'lazy';
            existingImage.decoding = 'async';
            return;
        }

        const placeholder = card.querySelector('div.product-img');
        placeholder?.replaceWith(createProductImage(src, alt));
    }

    function applyPhotoCarousel(card, product, images) {
        const alt = product.public_name || 'Product photo';
        const galleryKey = JSON.stringify(images);
        const existing = card.querySelector('[data-storefront-product-carousel]');
        if (existing?.dataset.galleryKey === galleryKey) {
            const image = existing.querySelector('img.product-img');
            if (image) image.alt = alt;
            return;
        }

        const carousel = document.createElement('div');
        carousel.className = 'storefront-product-carousel';
        carousel.dataset.storefrontProductCarousel = '';
        carousel.dataset.galleryKey = galleryKey;
        carousel.tabIndex = 0;
        carousel.setAttribute('role', 'group');
        carousel.setAttribute('aria-label', `${alt} photo gallery`);

        const image = createProductImage(images[0], alt);
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = 'storefront-product-carousel-button previous';
        previous.setAttribute('aria-label', `Previous photo of ${alt}`);
        previous.textContent = '‹';

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'storefront-product-carousel-button next';
        next.setAttribute('aria-label', `Next photo of ${alt}`);
        next.textContent = '›';

        const count = document.createElement('span');
        count.className = 'storefront-product-carousel-count';
        count.setAttribute('aria-live', 'polite');

        let currentIndex = 0;
        const render = () => {
            image.src = images[currentIndex];
            image.alt = `${alt} — photo ${currentIndex + 1} of ${images.length}`;
            count.textContent = `${currentIndex + 1}/${images.length}`;
        };
        const move = delta => {
            currentIndex = (currentIndex + delta + images.length) % images.length;
            render();
        };

        previous.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            move(-1);
        });
        next.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            move(1);
        });
        carousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();
                move(-1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();
                move(1);
            }
        });

        carousel.append(image, previous, next, count);
        render();

        const target = imageTarget(card);
        if (target) target.replaceWith(carousel);
        else card.prepend(carousel);
    }

    function productForCard(card) {
        const itemId = Number(card.dataset.storefrontItemId);
        if (Number.isInteger(itemId) && productsByItemId.has(itemId)) {
            return productsByItemId.get(itemId);
        }

        return productsByName.get(matchingName(cardTitle(card))) || null;
    }

    function ensureCardNavigation(card, product = null) {
        const detailPath = productDetailPath(product, card);
        if (!detailPath) {
            delete card.dataset.storefrontDetailUrl;
            return;
        }

        card.dataset.storefrontDetailUrl = detailPath;
        const title = card.querySelector('.product-info h3, h3');
        if (title) {
            let link = title.querySelector('a.storefront-product-link');
            if (!link) {
                link = document.createElement('a');
                link.className = 'storefront-product-link';
                link.textContent = title.textContent.trim();
                title.replaceChildren(link);
            }
            link.href = detailPath;
            link.setAttribute('aria-label', `View details for ${product?.public_name || cardTitle(card)}`);
        }

        if (card.dataset.storefrontNavigationBound === 'true') return;
        card.dataset.storefrontNavigationBound = 'true';
        card.addEventListener('click', event => {
            if (event.defaultPrevented) return;
            if (!(event.target instanceof Element)) return;
            if (event.target.closest('a, button, input, select, textarea, summary, label, [role="button"], [contenteditable="true"]')) {
                return;
            }

            const destination = card.dataset.storefrontDetailUrl;
            if (destination) window.location.assign(destination);
        });
    }

    function applyProductPhotos(card, product) {
        const images = productImages(product);
        const alt = product.public_name || 'Product photo';

        if (images.length <= 1) {
            applySinglePhoto(card, images[0], alt);
            return;
        }

        applyPhotoCarousel(card, product, images);
    }

    function applyCatalogState() {
        document.querySelectorAll('#page-shop .shop-category .product-card').forEach(card => {
            const product = productForCard(card);
            const isGenerated = card.hasAttribute('data-storefront-generated');

            if (!product) {
                const fallbackPath = staticDetailPath(card);
                if (fallbackPath && !isGenerated) {
                    card.hidden = false;
                    ensureCardNavigation(card);
                    return;
                }

                if (isGenerated) card.remove();
                else card.hidden = true;
                return;
            }

            card.hidden = false;
            card.dataset.storefrontItemId = String(product.item_id);

            const price = card.querySelector('.product-info .price, .price');
            const nextPrice = productPrice(product);
            if (price && price.textContent !== nextPrice) price.textContent = nextPrice;

            applyProductPhotos(card, product);
            ensureCardNavigation(card, product);
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
                applyCatalogState();
            } finally {
                refreshPromise = null;
            }
        })();

        return refreshPromise;
    }

    installCarouselStyles();

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
