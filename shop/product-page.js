(() => {
    'use strict';

    const CATALOG_URL = "https://zezpkoulxjagljjbyhhk.supabase.co/rest/v1/rpc/get_storefront_catalog";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv";
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });


    const SITE_HEADER = "<header class=\"site-header\">\n    <div class=\"nav-container\">\n        <a href=\"/#home\" class=\"logo\" aria-label=\"Go to Home page\">\n            <div class=\"logo-icon\"><img src=\"/images/Logo.svg\" alt=\"RRE Logo\"></div>\n            <span><span class=\"accent\">Red Rocks</span> Exotic Reptiles</span>\n        </a>\n        <nav class=\"nav-links\" aria-label=\"Primary navigation\">\n            <a href=\"/#home\">Home</a>\n            <a href=\"/#shop\" class=\"active\" aria-current=\"page\">Shop</a>\n            <a href=\"/#about\">About Us</a>\n            <a href=\"/#socials\">Socials</a>\n            <a href=\"/#reptilog\">ReptiLog</a>\n            <a href=\"/#care\">Care Guides</a>\n            <a href=\"/#faq\">Shipping/FAQs</a>\n        </nav>\n        <button class=\"hamburger\" id=\"hamburger\" type=\"button\" aria-label=\"Toggle navigation\" aria-expanded=\"false\" aria-controls=\"mobileNav\">\n            <span></span><span></span><span></span>\n        </button>\n    </div>\n    <nav class=\"mobile-nav\" id=\"mobileNav\" aria-label=\"Mobile navigation\">\n        <a href=\"/#home\">Home</a>\n        <a href=\"/#shop\" class=\"active\" aria-current=\"page\">Shop</a>\n        <a href=\"/#about\">About Us</a>\n        <a href=\"/#socials\">Socials</a>\n        <a href=\"/#reptilog\">ReptiLog</a>\n        <a href=\"/#care\">Care Guides</a>\n        <a href=\"/#faq\">Shipping/FAQs</a>\n    </nav>\n</header>";
    const SITE_FOOTER = "<footer class=\"site-footer\">\n    <div class=\"footer-grid\">\n        <div>\n            <h4 style=\"color:var(--accent);\">Red Rocks Exotic Reptiles</h4>\n            <p>Colorado's source for ethically bred reptiles, aquatic plants, and custom reptile goods. Woman, Veteran, Hispanic &amp; Native American owned.</p>\n        </div>\n        <div>\n            <h4>Quick Links</h4>\n            <a href=\"/#home\">Home</a><br>\n            <a href=\"/#shop\">Shop</a><br>\n            <a href=\"/#about\">About Us</a><br>\n            <a href=\"/#care\">Care Guides</a><br>\n            <a href=\"/#faq\">Shipping/FAQs</a><br>\n            <a href=\"/#faq\">Store Policies</a><br>\n            <a href=\"/#faq\">Privacy Policy</a>\n        </div>\n        <div>\n            <h4>Contact Us</h4>\n            <p>\n                <a href=\"mailto:rrereptiles@gmail.com\">rrereptiles@gmail.com</a><br>\n                <a href=\"tel:9704001278\">970-400-1278</a>\n            </p>\n        </div>\n        <div>\n            <h4>Follow Us</h4>\n            <a href=\"https://www.instagram.com/red_rocks_reptiles/\" target=\"_blank\" rel=\"noopener\">Instagram</a><br>\n            <a href=\"https://www.facebook.com/RREReptiles\" target=\"_blank\" rel=\"noopener\">Facebook</a><br>\n            <a href=\"https://www.tiktok.com/@redrocks_exotic_reptiles\" target=\"_blank\" rel=\"noopener\">TikTok</a><br>\n            <a href=\"https://www.youtube.com/@RedRocksExoticReptiles\" target=\"_blank\" rel=\"noopener\">YouTube</a><br>\n            <a href=\"https://www.morphmarket.com/stores/red_rocks_exotic_reptiles/\" target=\"_blank\" rel=\"noopener\">MorphMarket</a>\n        </div>\n    </div>\n    <div class=\"footer-bottom\">\n        <p>&copy; 2023&ndash;2026 Red Rocks Exotic Reptiles LLC. All rights reserved.</p>\n    </div>\n</footer>";

    function renderSiteShell() {
        const header = document.querySelector('body > header');
        const footer = document.querySelector('body > footer');
        if (header) header.outerHTML = SITE_HEADER;
        if (footer) footer.outerHTML = SITE_FOOTER;

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

    function applyProduct(product, layout) {
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
        if (!Number.isInteger(itemId) || itemId <= 0) return;

        try {
            const response = await fetch(CATALOG_URL, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json'
                },
                body: '{}'
            });
            const products = await response.json();
            if (!response.ok || !Array.isArray(products)) throw new Error('Catalog response was invalid.');
            const product = products.find(row => Number(row.item_id) === itemId);
            if (!product) throw new Error('Product is no longer published.');
            applyProduct(product, layout);
        } catch (error) {
            console.error('[product-page] catalog error', error);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
