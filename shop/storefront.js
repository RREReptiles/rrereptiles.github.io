(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const currency = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });

    const state = {
        products: new Map(),
        cart: loadCart(),
        loaded: false,
        paypalReady: false,
        paypalButtonsRendered: false,
        activePayPalOrderId: null
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

    function productImage(product) {
        return product.image_url || 'images/Logo.svg';
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

    function checkoutCart() {
        return state.cart.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity
        }));
    }

    function normalizeCartAgainstCatalog() {
        state.cart = state.cart.flatMap(item => {
            const product = state.products.get(item.itemId);
            if (!product || !product.in_stock || product.purchase_mode !== 'checkout') return [];

            const available = Math.max(0, Number(product.available_quantity || 0));
            const configuredMax = product.max_per_order == null
                ? available
                : Math.min(available, Number(product.max_per_order));
            const quantity = Math.min(item.quantity, configuredMax);
            return quantity > 0 ? [{ itemId: item.itemId, quantity }] : [];
        });
        saveCart();
    }

    function buildStorefrontShell() {
        const shopPage = document.getElementById('page-shop');
        const tabs = shopPage?.querySelector('.shop-tabs');
        const firstCategory = shopPage?.querySelector('.shop-category');
        if (!shopPage || !tabs || !firstCategory || document.getElementById('shop-online-store')) {
            return null;
        }

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'shop-tab storefront-tab';
        tab.dataset.shop = 'online-store';
        tab.textContent = 'Online Store';
        tabs.prepend(tab);

        const category = document.createElement('div');
        category.className = 'shop-category';
        category.id = 'shop-online-store';
        category.innerHTML = `
            <div class="storefront-header">
                <div>
                    <h3>Shop Current Inventory</h3>
                    <p>Availability and pricing are pulled directly from our ReptiTrax inventory.</p>
                </div>
                <button type="button" class="storefront-cart-button" data-storefront-open-cart>
                    Cart <span class="storefront-cart-count" data-storefront-cart-count>0</span>
                </button>
            </div>
            <div class="storefront-status" data-storefront-status>Loading current inventory…</div>
            <div class="storefront-grid" data-storefront-grid hidden></div>
        `;
        firstCategory.parentNode.insertBefore(category, firstCategory);

        tab.addEventListener('click', () => {
            shopPage.querySelectorAll('.shop-tab').forEach(button => button.classList.remove('active'));
            shopPage.querySelectorAll('.shop-category').forEach(panel => panel.classList.remove('active'));
            tab.classList.add('active');
            category.classList.add('active');
            if (!state.loaded) fetchCatalog();
        });

        tabs.addEventListener('click', event => {
            const clickedTab = event.target.closest('.shop-tab');
            if (clickedTab && clickedTab !== tab) {
                tab.classList.remove('active');
                category.classList.remove('active');
            }
        });

        category.querySelector('[data-storefront-open-cart]')
            .addEventListener('click', openCart);

        return category;
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
                    <p class="storefront-checkout-note">Shipping and any applicable taxes are confirmed before payment is completed.</p>
                    <div class="storefront-checkout-status" data-storefront-checkout-status aria-live="polite">Loading secure checkout…</div>
                    <div class="storefront-paypal-buttons" id="storefront-paypal-buttons" hidden></div>
                </div>
            </aside>
        `;

        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeCart();
        });
        overlay.querySelector('[data-storefront-close-cart]').addEventListener('click', closeCart);
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
        if (!response.ok) {
            throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
        }
        return payload;
    }

    async function fetchCatalog() {
        const status = document.querySelector('[data-storefront-status]');
        const grid = document.querySelector('[data-storefront-grid]');
        if (!status || !grid) return;

        status.hidden = false;
        status.textContent = 'Loading current inventory…';
        grid.hidden = true;

        try {
            const products = await requestJson(CATALOG_URL, {
                method: 'POST',
                body: '{}'
            });
            if (!Array.isArray(products)) throw new Error('Catalog response was invalid.');

            state.products = new Map(products.map(product => [Number(product.item_id), product]));
            state.loaded = true;
            normalizeCartAgainstCatalog();
            renderProducts(products);
            renderCart();
        } catch (error) {
            console.error('[storefront] catalog error', error);
            status.hidden = false;
            status.innerHTML = 'We could not load current inventory. Please refresh or <a href="mailto:rrereptiles@gmail.com">contact us</a>.';
            grid.hidden = true;
        }
    }

    function renderProducts(products) {
        const status = document.querySelector('[data-storefront-status]');
        const grid = document.querySelector('[data-storefront-grid]');
        if (!status || !grid) return;

        if (products.length === 0) {
            status.hidden = false;
            status.textContent = 'Online checkout products are being prepared. Our existing inquiry catalog remains available in the other tabs.';
            grid.hidden = true;
            return;
        }

        status.hidden = true;
        grid.hidden = false;
        grid.innerHTML = products.map(productCardHtml).join('');

        grid.querySelectorAll('[data-storefront-add]').forEach(button => {
            button.addEventListener('click', () => addToCart(Number(button.dataset.storefrontAdd)));
        });
    }

    function productCardHtml(product) {
        const itemId = Number(product.item_id);
        const available = Math.max(0, Number(product.available_quantity || 0));
        const lowStock = available > 0 && available <= 3;
        const name = escapeHtml(product.public_name);
        const description = escapeHtml(product.short_description || product.description || '');
        const image = escapeHtml(productImage(product));
        const price = currency.format(Number(product.price || 0));

        let action;
        if (product.purchase_mode === 'inquiry') {
            action = `<a class="storefront-inquiry-button" href="mailto:rrereptiles@gmail.com?subject=${encodeURIComponent(`Inquiry about ${product.public_name}`)}">Inquire</a>`;
        } else if (product.purchase_mode === 'local_only') {
            action = `<a class="storefront-inquiry-button" href="mailto:rrereptiles@gmail.com?subject=${encodeURIComponent(`Local pickup inquiry: ${product.public_name}`)}">Ask About Pickup</a>`;
        } else if (product.purchase_mode === 'coming_soon') {
            action = '<button class="storefront-add-button" type="button" disabled>Coming Soon</button>';
        } else {
            action = `<button class="storefront-add-button" type="button" data-storefront-add="${itemId}" ${product.in_stock ? '' : 'disabled'}>${product.in_stock ? 'Add to Cart' : 'Sold Out'}</button>`;
        }

        const stockLabel = product.show_quantity
            ? `${available} available`
            : (product.in_stock ? 'In stock' : 'Sold out');

        return `
            <article class="storefront-product">
                <img class="storefront-product-image" src="${image}" alt="${name}" loading="lazy" decoding="async">
                <div class="storefront-product-body">
                    <h3>${name}</h3>
                    <p class="storefront-product-description">${description}</p>
                    <div class="storefront-product-meta">
                        <span class="storefront-price">${price}</span>
                        <span class="storefront-stock ${lowStock ? 'low' : ''}">${escapeHtml(stockLabel)}</span>
                    </div>
                    ${action}
                </div>
            </article>
        `;
    }

    function addToCart(itemId) {
        const product = state.products.get(itemId);
        if (!product || !product.in_stock || product.purchase_mode !== 'checkout') return;

        const available = Math.max(0, Number(product.available_quantity || 0));
        const maxPerOrder = product.max_per_order == null
            ? available
            : Math.min(available, Number(product.max_per_order));
        const existing = state.cart.find(item => item.itemId === itemId);

        if (existing) {
            existing.quantity = Math.min(existing.quantity + 1, maxPerOrder);
        } else if (maxPerOrder > 0) {
            state.cart.push({ itemId, quantity: 1 });
        }

        saveCart();
        renderCart();
        openCart();
    }

    function updateQuantity(itemId, delta) {
        const item = state.cart.find(entry => entry.itemId === itemId);
        const product = state.products.get(itemId);
        if (!item || !product) return;

        const available = Math.max(0, Number(product.available_quantity || 0));
        const maxPerOrder = product.max_per_order == null
            ? available
            : Math.min(available, Number(product.max_per_order));
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
        const container = document.getElementById('storefront-paypal-buttons');
        if (!container) return;

        const hasItems = state.cart.some(item => state.products.has(item.itemId));
        container.hidden = !hasItems || !state.paypalReady;

        if (!hasItems) {
            setCheckoutStatus('Add an item to begin checkout.');
        } else if (!state.paypalReady) {
            setCheckoutStatus('Loading secure checkout…');
        } else {
            setCheckoutStatus('Pay securely with PayPal, Venmo, or an eligible card.');
        }
    }

    async function initializeCheckout() {
        try {
            const config = await requestJson(`${FUNCTIONS_URL}/storefront-config`, { method: 'GET' });
            if (!config.checkoutEnabled || !config.paypalClientId) {
                throw new Error('Online checkout is not enabled.');
            }

            await loadPayPalSdk(config.paypalClientId, config.currency || 'USD');
            state.paypalReady = true;
            renderPayPalButtons();
            updateCheckoutVisibility();
        } catch (error) {
            console.error('[storefront] checkout initialization error', error);
            setCheckoutStatus('Checkout is temporarily unavailable. Please contact us to order.', 'error');
        }
    }

    function loadPayPalSdk(clientId, checkoutCurrency) {
        if (window.paypal) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-rre-paypal-sdk]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', () => reject(new Error('PayPal checkout failed to load')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.dataset.rrePaypalSdk = '';
            script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(checkoutCurrency)}&intent=capture&components=buttons`;
            script.async = true;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', () => reject(new Error('PayPal checkout failed to load')), { once: true });
            document.head.appendChild(script);
        });
    }

    function renderPayPalButtons() {
        const container = document.getElementById('storefront-paypal-buttons');
        if (!container || !window.paypal || state.paypalButtonsRendered) return;

        state.paypalButtonsRendered = true;
        window.paypal.Buttons({
            style: {
                layout: 'vertical',
                shape: 'rect',
                label: 'paypal'
            },
            async createOrder() {
                if (state.cart.length === 0) throw new Error('Your cart is empty.');
                setCheckoutStatus('Confirming current price and availability…');

                const order = await requestJson(`${FUNCTIONS_URL}/create-paypal-order`, {
                    method: 'POST',
                    body: JSON.stringify({ cart: checkoutCart() })
                });
                state.activePayPalOrderId = order.id;
                return order.id;
            },
            async onApprove(data) {
                setCheckoutStatus('Completing payment and updating inventory…');
                try {
                    const completed = await requestJson(`${FUNCTIONS_URL}/capture-paypal-order`, {
                        method: 'POST',
                        body: JSON.stringify({ orderID: data.orderID })
                    });

                    state.activePayPalOrderId = null;
                    state.cart = [];
                    saveCart();
                    renderCart();
                    await fetchCatalog();
                    const name = completed.payerName ? `, ${completed.payerName}` : '';
                    setCheckoutStatus(`Payment complete${name}. Redirecting to order ${completed.orderNumber || ''}…`, 'success');
                    if (completed.confirmationUrl) {
                        window.location.assign(completed.confirmationUrl);
                        return;
                    }
                } catch (error) {
                    console.error('[storefront] capture error', error);
                    setCheckoutStatus(error.message || 'Payment could not be completed. No inventory was deducted.', 'error');
                    throw error;
                }
            },
            async onCancel(data) {
                const orderId = data?.orderID || state.activePayPalOrderId;
                state.activePayPalOrderId = null;
                setCheckoutStatus('Checkout was cancelled. Your cart is still available.');
                if (!orderId) return;

                try {
                    await requestJson(`${FUNCTIONS_URL}/cancel-paypal-order`, {
                        method: 'POST',
                        body: JSON.stringify({ orderID: orderId })
                    });
                } catch (error) {
                    console.warn('[storefront] cancellation cleanup failed', error);
                }
            },
            onError(error) {
                console.error('[storefront] PayPal error', error);
                setCheckoutStatus('PayPal checkout encountered an error. Please try again.', 'error');
            }
        }).render('#storefront-paypal-buttons').catch(error => {
            console.error('[storefront] PayPal button render error', error);
            state.paypalButtonsRendered = false;
            setCheckoutStatus('Checkout could not be displayed. Please contact us to order.', 'error');
        });
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

    function init() {
        const category = buildStorefrontShell();
        if (!category) return;
        buildCartDrawer();
        renderCart();
        fetchCatalog();
        initializeCheckout();
    }

    window.RREStorefront = {
        refresh: fetchCatalog,
        openCart
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
