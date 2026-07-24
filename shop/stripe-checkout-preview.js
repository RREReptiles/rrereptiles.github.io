(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v1';
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    let checkoutInstance = null;
    let activeSession = loadActiveSession();

    function cart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
            return Array.isArray(parsed)
                ? parsed.filter(item => Number.isInteger(item.itemId) && Number.isInteger(item.quantity) && item.quantity > 0)
                : [];
        } catch (_) {
            return [];
        }
    }

    function loadActiveSession() {
        try {
            const value = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || 'null');
            return value && typeof value === 'object' ? value : null;
        } catch (_) {
            return null;
        }
    }

    function saveActiveSession(value) {
        activeSession = value;
        if (value) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
        else sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }

    function cartHash(items) {
        return JSON.stringify([...items].sort((a, b) => a.itemId - b.itemId));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
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

    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value;
    }

    function showError(message) {
        document.querySelector('[data-checkout-loading]')?.setAttribute('hidden', '');
        document.querySelector('[data-checkout-layout]')?.setAttribute('hidden', '');
        const error = document.querySelector('[data-checkout-error]');
        error?.removeAttribute('hidden');
        setText('[data-checkout-error-message]', message);
    }

    function showPendingTotals(subtotal) {
        setText('[data-checkout-subtotal]', currency.format(subtotal));
        setText('[data-checkout-shipping]', 'Calculated at order review');
        setText('[data-checkout-tax]', 'Calculated at order review');
        setText('[data-checkout-total]', 'Calculated at order review');
        setText('[data-checkout-total-note]', 'Complete the delivery address in Stripe to see the final total.');
    }

    function showFinalTotals(result) {
        const shipping = Number(result.shippingTotal);
        const tax = Number(result.amountTax);
        const total = Number(result.orderTotal);
        if (!Number.isFinite(shipping) || !Number.isFinite(tax) || !Number.isFinite(total)) return;

        setText('[data-checkout-shipping]', currency.format(shipping));
        setText('[data-checkout-tax]', currency.format(tax));
        setText('[data-checkout-total]', currency.format(total));
        setText('[data-checkout-total-note]', 'Final shipping, tax, and total are calculated securely through Stripe.');
        document.querySelector('[data-checkout-totals]')?.classList.add('is-final');
    }

    function renderSummary(products, items) {
        const map = new Map(products.map(product => [Number(product.item_id), product]));
        const valid = items.filter(item => map.has(item.itemId));
        if (valid.length !== items.length) throw new Error('An item in your cart is no longer available.');

        const container = document.querySelector('[data-checkout-items]');
        const subtotal = valid.reduce((sum, item) => sum + Number(map.get(item.itemId).price) * item.quantity, 0);
        container.innerHTML = valid.map(item => {
            const product = map.get(item.itemId);
            return `
                <div class="checkout-item">
                    <img src="${escapeHtml(product.image_url || 'images/Logo.svg')}" alt="">
                    <div>
                        <h3>${escapeHtml(product.public_name)}</h3>
                        <p>Qty ${item.quantity} × ${currency.format(Number(product.price))}</p>
                    </div>
                    <strong>${currency.format(Number(product.price) * item.quantity)}</strong>
                </div>
            `;
        }).join('');

        showPendingTotals(subtotal);
        document.querySelector('[data-checkout-layout]').removeAttribute('hidden');
    }

    async function cancelSession(sessionId) {
        if (!sessionId) return;
        try {
            await requestJson(`${FUNCTIONS_URL}/cancel-stripe-checkout`, {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
        } catch (error) {
            console.warn('[checkout-preview] cancellation cleanup failed', error);
        }
    }

    async function initialize() {
        const items = cart();
        if (items.length === 0) {
            showError('Your cart is empty. Return to the shop and add an item before checking out.');
            return;
        }

        try {
            const [products, config] = await Promise.all([
                requestJson(CATALOG_URL, { method: 'POST', body: '{}' }),
                requestJson(`${FUNCTIONS_URL}/stripe-config`, { method: 'GET' })
            ]);
            renderSummary(products, items);
            if (!config.checkoutEnabled || !config.stripePublishableKey) throw new Error('Stripe checkout is not configured.');

            const liveMode = String(config.stripeEnvironment).toLowerCase() === 'live';
            if (!liveMode) document.querySelector('[data-checkout-sandbox]')?.removeAttribute('hidden');

            const currentHash = cartHash(items);
            if (activeSession && (activeSession.cartHash !== currentHash || Number(activeSession.expiresAt || 0) * 1000 <= Date.now() + 60000)) {
                await cancelSession(activeSession.sessionId);
                saveActiveSession(null);
            }

            const stripe = Stripe(config.stripePublishableKey);
            const fetchClientSecret = async () => {
                if (activeSession?.clientSecret && activeSession.cartHash === currentHash) return activeSession.clientSecret;
                const session = await requestJson(`${FUNCTIONS_URL}/create-stripe-checkout`, {
                    method: 'POST',
                    body: JSON.stringify({ cart: items })
                });
                saveActiveSession({
                    sessionId: session.sessionId,
                    clientSecret: session.clientSecret,
                    expiresAt: session.expiresAt,
                    cartHash: currentHash
                });
                return session.clientSecret;
            };

            const onShippingDetailsChange = async event => {
                try {
                    const result = await requestJson(`${FUNCTIONS_URL}/update-stripe-shipping`, {
                        method: 'POST',
                        body: JSON.stringify({
                            checkoutSessionId: event.checkoutSessionId,
                            shippingDetails: event.shippingDetails
                        })
                    });
                    showFinalTotals(result);
                    return { type: 'accept' };
                } catch (error) {
                    console.error('[checkout-preview] shipping error', error);
                    return { type: 'reject', errorMessage: error.message || 'Shipping could not be calculated for this address.' };
                }
            };

            checkoutInstance = await stripe.initEmbeddedCheckout({ fetchClientSecret, onShippingDetailsChange });
            document.querySelector('[data-checkout-loading]')?.setAttribute('hidden', '');
            checkoutInstance.mount('#checkout');
        } catch (error) {
            console.error('[checkout-preview] initialization error', error);
            showError(error.message || 'Secure checkout could not be loaded.');
        }
    }

    document.querySelector('[data-cancel-checkout]')?.addEventListener('click', async () => {
        const sessionId = activeSession?.sessionId;
        saveActiveSession(null);
        if (checkoutInstance?.destroy) checkoutInstance.destroy();
        await cancelSession(sessionId);
        window.location.assign('/?storefront-preview=1');
    });

    initialize();
})();