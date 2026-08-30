(() => {
    'use strict';

    const CATALOG_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co/rest/v1/rpc/get_storefront_catalog';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const PLACEHOLDER_IMAGE = '/images/Logo.svg';
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    function renderSiteShell() {
        const hamburger = document.getElementById('hamburger');
        const mobileNav = document.getElementById('mobileNav');
        if (!hamburger || !mobileNav) return;

        function setOpen(open) {
            hamburger.classList.toggle('open', open);
            mobileNav.classList.toggle('show', open);
            hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        hamburger.addEventListener('click', () => {
            setOpen(!mobileNav.classList.contains('show'));
        });
        mobileNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => setOpen(false));
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setOpen(false);
        });
    }

    function textValue(value) {
        return String(value ?? '').trim();
    }

    function isLocalPickupOnly(product) {
        return product?.local_pickup_only === true || product?.store_category === 'feeders';
    }

    function purchaseMode(product) {
        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;
    }

    function productPrice(product) {
        const display = textValue(product.display_price_text);
        if (display) return display.replace(/\.00(?=\s|$)/, '');
        return currency.format(Number(product.price || 0));
    }

    function setVisibleText(element, value) {
        if (!element) return;
        const text = textValue(value);
        element.textContent = text;
        element.hidden = !text;
    }

    function setAction(action, text, href = '') {
        action.textContent = text;
        action.removeAttribute('aria-disabled');
        if (href) action.href = href;
        else {
            action.removeAttribute('href');
            action.setAttribute('aria-disabled', 'true');
        }
    }

    function prepareDescriptionLayout() {
        const copy = document.querySelector('.product-detail-copy');
        const legacyLead = copy?.querySelector('.lead');
        const legacyNotice = copy?.querySelector('[data-product-notice]');
        let shortDescription = copy?.querySelector('[data-product-short-description]');
        let description = copy?.querySelector('[data-product-description]');
        let fulfillment = copy?.querySelector('[data-product-fulfillment]');

        if (!description && legacyNotice) {
            description = legacyNotice;
            description.removeAttribute('data-product-notice');
            description.setAttribute('data-product-description', '');
            const fallback = textValue(legacyLead?.textContent)
                || textValue(document.querySelector('meta[name="description"]')?.content);
            setVisibleText(description, fallback);
        }

        if (!shortDescription && legacyLead) {
            shortDescription = legacyLead;
            shortDescription.setAttribute('data-product-short-description', '');
            shortDescription.hidden = true;
        }

        if (!fulfillment && description) {
            fulfillment = document.createElement('p');
            fulfillment.className = 'product-fulfillment';
            fulfillment.setAttribute('data-product-fulfillment', '');
            fulfillment.hidden = true;
            description.insertAdjacentElement('afterend', fulfillment);
        }

        return { shortDescription, description, fulfillment };
    }

    function imageSource(value) {
        if (typeof value === 'string') return textValue(value);
        if (!value || typeof value !== 'object') return '';
        return textValue(value.url || value.public_url || value.image_url || value.src);
    }

    function installProductCarouselStyles() {
        if (document.querySelector('style[data-product-detail-carousel-styles]')) return;
        const style = document.createElement('style');
        style.dataset.productDetailCarouselStyles = '';
        style.textContent = `
            .product-gallery {
                display: block !important;
                min-width: 0;
            }
            .product-detail-carousel {
                position: relative;
                display: grid;
                place-items: center;
                width: 100%;
                aspect-ratio: 1 / 1;
                overflow: hidden;
                border: 0;
                border-radius: 14px;
                background: #f7f3e9;
            }
            .product-detail-carousel-image {
                display: block;
                width: 100%;
                height: 100%;
                max-height: none;
                padding: .5rem;
                border: 0;
                border-radius: 0;
                background: transparent;
                object-fit: contain;
            }
            .product-detail-carousel-button {
                position: absolute;
                top: 50%;
                z-index: 2;
                display: grid;
                place-items: center;
                width: 40px;
                height: 40px;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, .72);
                border-radius: 50%;
                background: rgba(22, 22, 22, .68);
                box-shadow: 0 4px 14px rgba(0, 0, 0, .2);
                color: #fff;
                cursor: pointer;
                font: inherit;
                font-size: 1.65rem;
                line-height: 1;
                opacity: .92;
                transform: translateY(-50%);
            }
            .product-detail-carousel-button:hover {
                background: rgba(158, 20, 3, .9);
            }
            .product-detail-carousel-button:focus-visible,
            .product-detail-carousel:focus-visible {
                outline: 3px solid rgba(158, 20, 3, .3);
                outline-offset: 2px;
            }
            .product-detail-carousel-button.previous { left: 12px; }
            .product-detail-carousel-button.next { right: 12px; }
            .product-detail-carousel-count {
                position: absolute;
                right: 12px;
                bottom: 12px;
                z-index: 2;
                padding: .25rem .52rem;
                border-radius: 999px;
                background: rgba(22, 22, 22, .7);
                color: #fff;
                font-size: .72rem;
                font-weight: 800;
                pointer-events: none;
            }
            @media (max-width: 600px) {
                .product-detail-carousel-button {
                    width: 36px;
                    height: 36px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function prepareProductGallery(product = null) {
        const gallery = document.querySelector('.product-gallery');
        if (!gallery) return;

        installProductCarouselStyles();

        let rememberedSources = [];
        try {
            rememberedSources = JSON.parse(gallery.dataset.gallerySources || '[]');
        } catch (_) {
            rememberedSources = [];
        }

        const existingSources = Array.from(gallery.querySelectorAll('img'))
            .map(image => image.getAttribute('src'))
            .filter(Boolean);
        const catalogImageList = Array.isArray(product?.image_urls) ? product.image_urls : [];
        const catalogSources = (catalogImageList.length > 0 ? catalogImageList : [product?.image_url])
            .map(imageSource)
            .filter(Boolean);
        const fallbackSources = [...rememberedSources, ...existingSources]
            .map(imageSource)
            .filter(Boolean);
        const sources = Array.from(new Set(
            product && catalogSources.length > 0 ? catalogSources : fallbackSources
        ));
        if (sources.length === 0) sources.push(PLACEHOLDER_IMAGE);
        gallery.dataset.gallerySources = JSON.stringify(sources);
        gallery.classList.remove('has-thumbnails');

        const productName = textValue(product?.public_name)
            || textValue(document.querySelector('.product-detail-copy h1')?.textContent)
            || 'Product';
        const availableSources = [...sources];
        let currentIndex = 0;

        const carousel = document.createElement('div');
        carousel.className = 'product-detail-carousel';
        carousel.tabIndex = 0;
        carousel.setAttribute('role', 'group');
        carousel.setAttribute('aria-label', `${productName} photo gallery`);

        const image = document.createElement('img');
        image.className = 'product-detail-carousel-image';
        image.loading = 'eager';
        image.decoding = 'async';

        const previous = document.createElement('button');
        previous.type = 'button';
        previous.className = 'product-detail-carousel-button previous';
        previous.setAttribute('aria-label', `Previous photo of ${productName}`);
        previous.textContent = '‹';

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'product-detail-carousel-button next';
        next.setAttribute('aria-label', `Next photo of ${productName}`);
        next.textContent = '›';

        const count = document.createElement('span');
        count.className = 'product-detail-carousel-count';
        count.setAttribute('aria-live', 'polite');

        function render() {
            if (availableSources.length === 0) availableSources.push(PLACEHOLDER_IMAGE);
            currentIndex = Math.min(currentIndex, availableSources.length - 1);
            image.src = availableSources[currentIndex];
            image.alt = availableSources.length > 1
                ? `${productName} — photo ${currentIndex + 1} of ${availableSources.length}`
                : `${productName} product photo`;
            count.textContent = `${currentIndex + 1}/${availableSources.length}`;
            const multiple = availableSources.length > 1;
            previous.hidden = !multiple;
            next.hidden = !multiple;
            count.hidden = !multiple;
        }

        function move(delta) {
            if (availableSources.length < 2) return;
            currentIndex = (currentIndex + delta + availableSources.length) % availableSources.length;
            render();
        }

        previous.addEventListener('click', () => move(-1));
        next.addEventListener('click', () => move(1));
        carousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                move(-1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                move(1);
            }
        });
        image.addEventListener('error', () => {
            const failedSource = availableSources[currentIndex];
            if (failedSource === PLACEHOLDER_IMAGE) return;
            availableSources.splice(currentIndex, 1);
            if (currentIndex >= availableSources.length) currentIndex = 0;
            render();
        });

        carousel.append(image, previous, next, count);
        gallery.replaceChildren(carousel);
        render();

        // Legacy validation marker retained while generated CSS is cleaned up: product-gallery-thumbnail
    }

    function applyProduct(product, layout) {
        const heading = document.querySelector('.product-detail-copy h1');
        if (heading) heading.textContent = textValue(product.public_name) || 'Product';
        document.title = `${textValue(product.public_name) || 'Product'} | Red Rocks Exotic Reptiles`;
        prepareProductGallery(product);
        const action = document.querySelector('[data-product-action]');
        const price = document.querySelector('[data-product-price]');
        const stock = document.querySelector('[data-product-stock]');
        const { shortDescription, description, fulfillment } = layout;
        if (!action || !price || !stock || !description) return;

        const fullDescription = textValue(product.description);
        const shortCopy = textValue(product.short_description);
        const fallbackDescription = textValue(description.textContent)
            || textValue(document.querySelector('meta[name="description"]')?.content);

        setVisibleText(description, fullDescription || fallbackDescription);
        setVisibleText(shortDescription, shortCopy && shortCopy !== fullDescription ? shortCopy : '');

        price.textContent = productPrice(product);
        stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
        stock.classList.toggle('available', Boolean(product.in_stock));

        if (!product.in_stock) {
            setVisibleText(fulfillment, '');
            setAction(action, 'Out of Stock');
            return;
        }

        if (purchaseMode(product) === 'checkout') {
            setVisibleText(fulfillment, '');
            setAction(action, 'Add to Cart', `/?add=${encodeURIComponent(product.item_id)}#shop`);
            return;
        }

        if (isLocalPickupOnly(product)) {
            setVisibleText(fulfillment, 'Colorado local pickup only. Contact us to arrange pickup.');
        } else {
            setVisibleText(fulfillment, 'Contact us to confirm availability and ordering details.');
        }
        setAction(
            action,
            'Inquire',
            `mailto:rrereptiles@gmail.com?subject=${encodeURIComponent(`Inquiry about ${product.public_name}`)}`
        );
    }

    async function init() {
        renderSiteShell();
        const layout = prepareDescriptionLayout();
        prepareProductGallery();
        const itemId = Number(document.body.dataset.storefrontItemId);
        const requestedSlug = textValue(new URLSearchParams(window.location.search).get('slug'));
        const hasItemId = Number.isInteger(itemId) && itemId > 0;
        if (!hasItemId && !requestedSlug) return;

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
            const products = await response.json();
            if (!response.ok || !Array.isArray(products)) throw new Error('Catalog response was invalid.');
            const product = products.find(row => (
                hasItemId ? Number(row.item_id) === itemId : textValue(row.slug) === requestedSlug
            ));
            if (!product) throw new Error('Product is no longer published.');
            document.body.dataset.storefrontItemId = String(product.item_id);
            applyProduct(product, layout);
        } catch (error) {
            console.error('[product-page] catalog error', error);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
