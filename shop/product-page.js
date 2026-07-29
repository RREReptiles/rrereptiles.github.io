(() => {
    'use strict';

    const CATALOG_URL = "https://zezpkoulxjagljjbyhhk.supabase.co/rest/v1/rpc/get_storefront_catalog";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv";
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    const SITE_HEADER = `
<header class="site-header">
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
</header>`;

    const SITE_FOOTER = `
<footer class="site-footer">
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
</footer>`;

    function textValue(value) {
        return String(value ?? '').trim();
    }

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
