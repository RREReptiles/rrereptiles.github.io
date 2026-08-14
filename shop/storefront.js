(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const currency = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });

    const STATIC_NAME_ALIASES = new Map([
        ['small metal tongs', 'metal tongs'],
        ['round flat hide', 'flat hides']
    ]);

    const CATALOG_IMAGE_OVERRIDES = new Set([
        'rotala indica orange juice',
        'anacharis'
    ]);

    const state = {
        products: new Map(),
        cart: loadCart(),
        loaded: false
    };

    function loadCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(item => Number.isInteger(item.itemId) && Number.isInteger(item.quantity))
                .map(item => ({ itemId: item.itemId, quantity: Math.max(1, item.quantity) }));
        } catch (_) {
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

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

    function productImage(product) {
        return product.image_url || 'images/Logo.svg';
    }

    function productDetailUrl(product) {
        const slug = String(product?.slug || `item-${product?.item_id || 'product'}`);
        return `/products/${encodeURIComponent(slug)}.html`;
    }

    function syncProductDetailLink(card, product) {
        if (!card || !product) return;
        const title = card.querySelector('.product-info h3, h3');
        if (!title) return;
        let link = title.querySelector('a.storefront-product-link');
        if (!link) {
            link = document.createElement('a');
            link.className = 'storefront-product-link';
            link.textContent = title.textContent.trim();
            title.replaceChildren(link);
        }
        link.href = productDetailUrl(product);
        link.setAttribute('aria-label', `View details for ${product.public_name}`);
    }


    function productPrice(product) {
        const display = String(product.display_price_text || '').trim();
        if (display) return display.replace(/\.00(?=\s|$)/, '');
        return currency.format(Number(product.price || 0));
    }

    function isLocalPickupOnly(product) {
        return product?.local_pickup_only === true || product?.store_category === 'feeders';
    }

    function purchaseMode(product) {
        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;
    }

    function totalCartQuantity() {
        return state.cart.reduce((sum, item) => sum + item.quantity, 0);
    }

    function cartSubtotal() {
        return state.cart.reduce((sum, item) => {
            const product = state.products.get(item.itemId);
            return product ? sum + Number(product.price) * item.quantity : sum;
        }, 0);
    }

    function normalizeCartAgainstCatalog() {
        state.cart = state.cart.flatMap(item => {
            const product = state.products.get(item.itemId);
            if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return [];
            const available = Math.max(0, Number(product.available_quantity || 0));
            const configuredMax = product.max_per_order == null
                ? available
                : Math.min(available, Number(product.max_per_order));
            const quantity = Math.min(item.quantity, configuredMax);
            return quantity > 0 ? [{ itemId: item.itemId, quantity }] : [];
        });
        saveCart();
    }

    function ensureFeederPickupNotice() {
        const panel = document.getElementById('shop-feeders');
        if (!panel) return;

        let notice = panel.querySelector(':scope > .shop-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'shop-notice';
            panel.prepend(notice);
        }
        notice.classList.add('storefront-local-pickup-notice');
        notice.innerHTML = '<strong>Local Pickup Only:</strong> Live insects, feeder cultures, and other feeder items are available for local pickup in Colorado only. We do not ship live feeders. Use the Inquire button to confirm current availability, quantities, pricing, and pickup arrangements.';
    }

    function ensureTropicalPlantCategory() {
        const shopPage = document.getElementById('page-shop');
        const section = shopPage?.querySelector(':scope > .section');
        const tabs = section?.querySelector('.shop-tabs');
        if (!shopPage || !section || !tabs) return;

        let tab = tabs.querySelector('.shop-tab[data-shop="tropical-plants"]');
        if (!tab) {
            tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'shop-tab';
            tab.dataset.shop = 'tropical-plants';
            tab.textContent = 'Tropical Plants';
            tab.addEventListener('click', () => window.setShopCategory?.('tropical-plants'));

            const aquaticTab = tabs.querySelector('.shop-tab[data-shop="plants"]');
            aquaticTab?.insertAdjacentElement('afterend', tab);
            if (!tab.isConnected) tabs.appendChild(tab);
        }

        let panel = document.getElementById('shop-tropical-plants');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'shop-category';
            panel.id = 'shop-tropical-plants';
            panel.innerHTML = `
                <p class="section-subtitle">Tropical and terrarium plants for planted enclosures, bioactive habitats, and indoor growing.</p>
                <div class="product-grid"></div>
            `;

            const aquaticPanel = document.getElementById('shop-plants');
            aquaticPanel?.insertAdjacentElement('afterend', panel);
            if (!panel.isConnected) section.appendChild(panel);
        }
    }

    function buildStorefrontShell() {
        const shopPage = document.getElementById('page-shop');
        const section = shopPage?.querySelector(':scope > .section');
        const tabs = section?.querySelector('.shop-tabs');
        if (!shopPage || !section || !tabs) return null;

        document.querySelector('.storefront-tab')?.remove();
        document.getElementById('shop-online-store')?.remove();

        let header = section.querySelector('[data-storefront-header]');
        if (!header) {
            header = document.createElement('div');
            header.className = 'storefront-header';
            header.dataset.storefrontHeader = '';
            header.innerHTML = `
                <div>
                    <h3>Shop Current Inventory</h3>
                    <p>Products and pricing are managed through our inventory system. Items remain unavailable online until their inventory and shipping details are verified.</p>
                </div>
                <button type="button" class="storefront-cart-button" data-storefront-open-cart>
                    Cart <span class="storefront-cart-count" data-storefront-cart-count>0</span>
                </button>
            `;
            tabs.parentNode.insertBefore(header, tabs);
        }

        let status = section.querySelector('[data-storefront-status]');
        if (!status) {
            status = document.createElement('div');
            status.className = 'storefront-status';
            status.dataset.storefrontStatus = '';
            status.textContent = 'Loading current inventory…';
            tabs.insertAdjacentElement('afterend', status);
        }

        header.querySelector('[data-storefront-open-cart]')?.addEventListener('click', openCart);
        return section;
    }

    function buildCartDrawer() {
        if (document.querySelector('[data-storefront-cart-overlay]')) return;
        const overlay = document.createElement('div');
        overlay.className = 'storefront-cart-overlay';
        overlay.dataset.storefrontCartOverlay = '';
        overlay.innerHTML = `
            <aside class="storefront-cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
                <div class="storefront-cart-header">
                    <h3>Your Cart</h3>
                    <button type="button" class="storefront-cart-close" aria-label="Close cart" data-storefront-close-cart>&times;</button>
                </div>
                <div class="storefront-cart-items" data-storefront-cart-items></div>
                <div class="storefront-cart-footer">
                    <div class="storefront-cart-total">
                        <span>Subtotal</span>
                        <span data-storefront-cart-subtotal>$0.00</span>
                    </div>
                    <p class="storefront-checkout-note">USPS shipping and applicable sales tax are calculated from the delivery address during secure Stripe checkout.</p>
                    <div class="storefront-checkout-status" data-storefront-checkout-status aria-live="polite"></div>
                    <button type="button" class="storefront-add-button storefront-checkout-button" data-storefront-checkout disabled>
                        Secure Checkout
                    </button>
                </div>
            </aside>
        `;

        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeCart();
        });
        overlay.querySelector('[data-storefront-close-cart]').addEventListener('click', closeCart);
        overlay.querySelector('[data-storefront-checkout]').addEventListener('click', beginCheckout);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && overlay.classList.contains('open')) closeCart();
        });
        document.body.appendChild(overlay);
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
        return payload;
    }

    async function fetchCatalog() {
        const status = document.querySelector('[data-storefront-status]');
        if (!status) return;
        status.hidden = false;
        status.textContent = 'Loading current inventory…';

        try {
            const products = await requestJson(CATALOG_URL, { method: 'POST', body: '{}' });
            if (!Array.isArray(products)) throw new Error('Catalog response was invalid.');
            state.products = new Map(products.map(product => [Number(product.item_id), product]));
            state.loaded = true;
            normalizeCartAgainstCatalog();
            renderProducts(products);
            renderCart();
            handleStorefrontRequest();
            status.hidden = true;
        } catch (error) {
            console.error('[storefront] catalog error', error);
            status.hidden = false;
            status.innerHTML = 'We could not load current inventory. Please refresh or <a href="mailto:rrereptiles@gmail.com">contact us</a>.';
        }
    }

    function findStaticCard(panel, product) {
        const target = matchingName(product.public_name);
        return Array.from(panel.querySelectorAll('.product-card:not([data-storefront-generated])')).find(card => {
            const title = card.querySelector('.product-info h3, h3');
            return matchingName(title?.textContent) === target;
        }) || null;
    }

    function markCardAvailability(card, product = null) {
        if (product) syncProductDetailLink(card, product);
        const info = card.querySelector('.product-info') || card;
        const price = info.querySelector('.price');
        if (price && product) price.textContent = productPrice(product);

        info.querySelectorAll('.inquire, [data-storefront-action], [data-storefront-stock-label], [data-storefront-local-pickup]').forEach(element => element.remove());

        if (product && isLocalPickupOnly(product)) {
            const badge = document.createElement('span');
            badge.className = 'storefront-local-pickup-badge';
            badge.dataset.storefrontLocalPickup = '';
            badge.textContent = 'Local Pickup Only';
            info.appendChild(badge);
        }

        const stock = document.createElement('p');
        stock.className = 'storefront-stock';
        stock.dataset.storefrontStockLabel = '';
        stock.textContent = product?.in_stock ? 'In stock' : 'Out of stock';
        info.appendChild(stock);

        if (product?.in_stock && purchaseMode(product) === 'checkout') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'storefront-add-button';
            button.dataset.storefrontAction = '';
            button.dataset.storefrontAdd = String(product.item_id);
            button.textContent = 'Add to Cart';
            info.appendChild(button);
            return;
        }

        if (product?.in_stock && purchaseMode(product) === 'inquiry') {
            const link = document.createElement('a');
            link.className = 'storefront-inquiry-button';
            link.dataset.storefrontAction = '';
            link.href = `mailto:rrereptiles@gmail.com?subject=${encodeURIComponent(`Inquiry about ${product.public_name}`)}`;
            link.textContent = 'Inquire';
            info.appendChild(link);
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'storefront-add-button';
        button.dataset.storefrontAction = '';
        button.disabled = true;
        button.textContent = 'Out of Stock';
        info.appendChild(button);
    }

    function generatedCard(product) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.storefrontGenerated = 'true';
        card.dataset.storefrontItemId = String(product.item_id);
        const description = product.short_description || product.description || '';
        card.innerHTML = `
            <img src="${escapeHtml(productImage(product))}" alt="${escapeHtml(product.public_name)}" class="product-img" loading="lazy" decoding="async">
            <div class="product-info">
                <h3>${escapeHtml(product.public_name)}</h3>
                ${description ? `<p class="species">${escapeHtml(description)}</p>` : ''}
                <span class="price">${escapeHtml(productPrice(product))}</span>
            </div>
        `;
        markCardAvailability(card, product);
        return card;
    }

    function syncStaticCardImage(card, product) {
        const imageUrl = productImage(product);
        const currentImage = card.querySelector('img.product-img');
        const placeholder = card.querySelector('div.product-img');
        const shouldReplaceHardcodedImage = CATALOG_IMAGE_OVERRIDES.has(matchingName(product.public_name));

        if (currentImage && (product.image_url || shouldReplaceHardcodedImage)) {
            currentImage.src = imageUrl;
            currentImage.alt = product.public_name;
            currentImage.loading = 'lazy';
            currentImage.decoding = 'async';
            return;
        }

        if (!placeholder || !product.image_url) return;

        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = product.public_name;
        image.className = 'product-img';
        image.loading = 'lazy';
        image.decoding = 'async';
        placeholder.replaceWith(image);
    }































    function storefrontCategory(product) {
        const category = String(product?.store_category || '').trim().toLowerCase();
        if (['animal', 'animals', 'reptile', 'reptiles', 'geckos-crested', 'geckos-other'].includes(category)) {
            return 'animals';
        }
        return category || 'husbandry-supplies';
    }

    function renderProducts(products) {
        document.querySelectorAll('.product-card[data-storefront-generated]').forEach(card => card.remove());

        const staticCards = document.querySelectorAll('#page-shop .shop-category .product-card');
        staticCards.forEach(card => markCardAvailability(card));

        products.forEach(product => {
            const category = storefrontCategory(product);
            const panel = document.getElementById(`shop-${category}`)
                || document.getElementById('shop-husbandry-supplies');
            const grid = panel?.querySelector('.product-grid');
            if (!panel || !grid) return;

            const existing = findStaticCard(panel, product);
            if (existing) {
                existing.dataset.storefrontItemId = String(product.item_id);
                syncStaticCardImage(existing, product);
                markCardAvailability(existing, product);
            } else {
                grid.appendChild(generatedCard(product));
            }
        });

        document.querySelectorAll('[data-storefront-add]').forEach(button => {
            button.addEventListener('click', () => addToCart(Number(button.dataset.storefrontAdd)));
        });
    }

    function addToCart(itemId) {
        const product = state.products.get(itemId);
        if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return;
        const available = Math.max(0, Number(product.available_quantity || 0));
        const maxPerOrder = product.max_per_order == null ? available : Math.min(available, Number(product.max_per_order));
        const existing = state.cart.find(item => item.itemId === itemId);
        if (existing) existing.quantity = Math.min(existing.quantity + 1, maxPerOrder);
        else if (maxPerOrder > 0) state.cart.push({ itemId, quantity: 1 });
        saveCart();
        renderCart();
        openCart();
    }

    function updateQuantity(itemId, delta) {
        const item = state.cart.find(entry => entry.itemId === itemId);
        const product = state.products.get(itemId);
        if (!item || !product) return;
        const available = Math.max(0, Number(product.available_quantity || 0));
        const maxPerOrder = product.max_per_order == null ? available : Math.min(available, Number(product.max_per_order));
        item.quantity = Math.max(0, Math.min(item.quantity + delta, maxPerOrder));
        if (item.quantity === 0) state.cart = state.cart.filter(entry => entry.itemId !== itemId);
        saveCart();
        renderCart();
    }

    function removeFromCart(itemId) {
        state.cart = state.cart.filter(item => item.itemId !== itemId);
        saveCart();
        renderCart();
    }

    function renderCart() {
        document.querySelectorAll('[data-storefront-cart-count]').forEach(element => {
            element.textContent = String(totalCartQuantity());
        });
        const itemsContainer = document.querySelector('[data-storefront-cart-items]');
        const subtotalElement = document.querySelector('[data-storefront-cart-subtotal]');
        if (!itemsContainer || !subtotalElement) return;
        const validItems = state.cart.filter(item => state.products.has(item.itemId));
        if (validItems.length === 0) {
            itemsContainer.innerHTML = '<div class="storefront-cart-empty">Your cart is empty.</div>';
        } else {
            itemsContainer.innerHTML = validItems.map(item => {
                const product = state.products.get(item.itemId);
                return `
                    <div class="storefront-cart-item">
                        <img src="${escapeHtml(productImage(product))}" alt="" loading="lazy">
                        <div>
                            <h4>${escapeHtml(product.public_name)}</h4>
                            <div class="storefront-cart-item-price">${currency.format(Number(product.price))} each</div>
                            <div class="storefront-quantity-controls" aria-label="Quantity controls">
                                <button type="button" data-storefront-decrease="${item.itemId}" aria-label="Decrease quantity">&minus;</button>
                                <span>${item.quantity}</span>
                                <button type="button" data-storefront-increase="${item.itemId}" aria-label="Increase quantity">+</button>
                            </div>
                        </div>
                        <button type="button" class="storefront-remove-item" data-storefront-remove="${item.itemId}" aria-label="Remove ${escapeHtml(product.public_name)}">&times;</button>
                    </div>
                `;
            }).join('');
        }
        itemsContainer.querySelectorAll('[data-storefront-decrease]').forEach(button => {
            button.addEventListener('click', () => updateQuantity(Number(button.dataset.storefrontDecrease), -1));
        });
        itemsContainer.querySelectorAll('[data-storefront-increase]').forEach(button => {
            button.addEventListener('click', () => updateQuantity(Number(button.dataset.storefrontIncrease), 1));
        });
        itemsContainer.querySelectorAll('[data-storefront-remove]').forEach(button => {
            button.addEventListener('click', () => removeFromCart(Number(button.dataset.storefrontRemove)));
        });
        subtotalElement.textContent = currency.format(cartSubtotal());
        updateCheckoutVisibility();
    }

    function setCheckoutStatus(message, type = '') {
        const status = document.querySelector('[data-storefront-checkout-status]');
        if (!status) return;
        status.textContent = message;
        status.className = `storefront-checkout-status ${type}`.trim();
    }

    function updateCheckoutVisibility() {
        const button = document.querySelector('[data-storefront-checkout]');
        if (!button) return;
        const hasItems = state.cart.some(item => state.products.has(item.itemId));
        button.disabled = !hasItems;
        setCheckoutStatus(hasItems
            ? 'Secure card and wallet payments are processed by Stripe.'
            : 'Products will become purchasable as their shipping details are verified.');
    }











































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

    function beginCheckout() {
        if (state.cart.length === 0) return;
        const preview = new URLSearchParams(window.location.search).get('storefront-preview') === '1';
        window.location.assign(`/checkout.html${preview ? '?storefront-preview=1' : ''}`);
    }

    function openCart() {
        const overlay = document.querySelector('[data-storefront-cart-overlay]');
        if (!overlay) return;
        overlay.classList.add('open');
        document.body.classList.add('storefront-cart-open');
        overlay.querySelector('[data-storefront-close-cart]')?.focus();
    }

    function closeCart() {
        const overlay = document.querySelector('[data-storefront-cart-overlay]');
        if (!overlay) return;
        overlay.classList.remove('open');
        document.body.classList.remove('storefront-cart-open');
    }

    function updateWebsitePrivacyPolicy() {
        const section = document.getElementById('privacy-policy');
        if (!section) return;
        section.innerHTML = `
            <h3>Privacy Policy</h3>
            <p><strong>Last updated:</strong> July 24, 2026</p>
            <p>This privacy policy applies to rrereptiles.com, our online storefront, and customer communications. ReptiLog is covered by its own <a href="https://reptilog.app/privacy-policy.html" target="_blank" rel="noopener">privacy policy</a>.</p>

            <h4>Information We Collect</h4>
            <p>When you contact us, use the storefront, or place an order, we may receive your name, email address, phone number, billing or shipping address, order details, messages, transaction status, and technical information needed to operate and secure the website.</p>
            <p>The storefront stores cart contents in your browser and maintains a temporary checkout-session record so your cart and Stripe checkout can function correctly.</p>

            <h4>Payments</h4>
            <p>Online payments are processed by Stripe through its secure checkout interface. Red Rocks Exotic Reptiles does not receive or store your complete card number or security code. We receive the transaction and order information needed to process, fulfill, refund, and support your purchase.</p>

            <h4>How We Use and Share Information</h4>
            <p>Information is used to process payments, calculate shipping and applicable taxes, fulfill orders, communicate with customers, maintain inventory and accounting records, prevent fraud, and comply with legal obligations.</p>
            <p>We may share necessary information with Stripe, Supabase, shipping carriers, transactional email providers, and website infrastructure providers. We do not sell personal information or provide customer order information to advertisers.</p>

            <h4>Retention, Security, and Requests</h4>
            <p>We retain records as reasonably necessary for fulfillment, customer service, accounting, tax, dispute, fraud-prevention, and legal purposes. We use reasonable safeguards, but no online system can guarantee absolute security.</p>
            <p>You may contact <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a> to request access to, correction of, or deletion of personal information we control. Some records may need to be retained for legal, tax, accounting, or fraud-prevention purposes.</p>

            <p><a href="/policies/privacy-policy.html" target="_blank" rel="noopener"><strong>Read the full Privacy Policy</strong></a></p>
        `;
    }

    function init() {
        updateWebsitePrivacyPolicy();
        ensureTropicalPlantCategory();
        ensureFeederPickupNotice();
        const shell = buildStorefrontShell();
        if (!shell) return;
        buildCartDrawer();
        renderCart();
        fetchCatalog();
    }

    window.RREStorefront = { refresh: fetchCatalog, openCart };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
