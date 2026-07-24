(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v2';
    const LEGACY_SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v1';
    const DELIVERY_STORAGE_KEY = 'rre-checkout-delivery-v2';
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    let checkoutInstance = null;
    let activeSession = loadJson(sessionStorage, SESSION_STORAGE_KEY);
    let checkoutConfig = null;
    let cartItems = [];
    let catalogProducts = [];

    const $ = selector => document.querySelector(selector);

    function loadJson(storage, key) {
        try {
            const value = JSON.parse(storage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : null;
        } catch (_) {
            return null;
        }
    }

    function saveJson(storage, key, value) {
        if (value) storage.setItem(key, JSON.stringify(value));
        else storage.removeItem(key);
    }

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

    function cartHash(items) {
        return JSON.stringify([...items].sort((a, b) => a.itemId - b.itemId));
    }

    function addressHash(shippingDetails) {
        return JSON.stringify(shippingDetails);
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
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 45000);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
            return payload;
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('The checkout request took too long. Please try again.');
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function showError(message, title = 'Checkout could not continue') {
        const box = $('[data-checkout-error]');
        $('[data-checkout-error-title]').textContent = title;
        $('[data-checkout-error-message]').textContent = message;
        box.removeAttribute('hidden');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearError() {
        $('[data-checkout-error]')?.setAttribute('hidden', '');
    }

    function showFatalError(message) {
        $('[data-page-loading]')?.setAttribute('hidden', '');
        $('[data-checkout-layout]')?.setAttribute('hidden', '');
        showError(message, 'Checkout could not start');
    }

    function renderSummary(products, items) {
        const map = new Map(products.map(product => [Number(product.item_id), product]));
        const valid = items.filter(item => map.has(item.itemId));
        if (valid.length !== items.length) throw new Error('An item in your cart is no longer available.');

        const itemCount = valid.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = valid.reduce(
            (sum, item) => sum + Number(map.get(item.itemId).price) * item.quantity,
            0
        );
        $('[data-checkout-items]').innerHTML = valid.map(item => {
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
        $('[data-cart-count]').textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
        $('[data-checkout-subtotal]').textContent = currency.format(subtotal);
        $('[data-review-subtotal]').textContent = currency.format(subtotal);
        return subtotal;
    }

    function setStep(step) {
        const delivery = step === 'delivery';
        $('[data-delivery-step]').toggleAttribute('hidden', !delivery);
        $('[data-review-step]').toggleAttribute('hidden', delivery);

        const deliveryIndicator = $('[data-step-indicator="delivery"]');
        const reviewIndicator = $('[data-step-indicator="review"]');
        deliveryIndicator.classList.toggle('is-active', delivery);
        deliveryIndicator.classList.toggle('is-complete', !delivery);
        reviewIndicator.classList.toggle('is-active', !delivery);
    }

    function setReviewBusy(busy) {
        const button = $('[data-review-order]');
        button.disabled = busy;
        $('[data-review-label]').textContent = busy ? 'Calculating final total…' : 'Review order';
    }

    function clearFieldErrors() {
        document.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid'));
        document.querySelectorAll('.field-error').forEach(error => error.remove());
    }

    function setFieldError(field, message) {
        field.setAttribute('aria-invalid', 'true');
        const error = document.createElement('small');
        error.className = 'field-error';
        error.textContent = message;
        field.closest('.field')?.append(error);
    }

    function validateDeliveryForm(form) {
        clearFieldErrors();
        let firstInvalid = null;
        const requiredMessages = {
            email: 'Enter a valid email address.',
            name: 'Enter the recipient name.',
            line1: 'Enter the street address.',
            city: 'Enter the city.',
            state: 'Select a state.',
            postal_code: 'Enter a five-digit ZIP code.'
        };

        for (const field of form.elements) {
            if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue;
            let valid = field.checkValidity();
            if (field.name === 'postal_code') valid = /^\d{5}$/.test(field.value.trim());
            if (!valid) {
                setFieldError(field, requiredMessages[field.name] || 'Review this field.');
                firstInvalid ||= field;
            }
        }
        firstInvalid?.focus();
        return !firstInvalid;
    }

    function formShippingDetails(form) {
        const data = new FormData(form);
        return {
            name: String(data.get('name') || '').trim(),
            email: String(data.get('email') || '').trim(),
            phone: String(data.get('phone') || '').trim(),
            address: {
                line1: String(data.get('line1') || '').trim(),
                line2: String(data.get('line2') || '').trim(),
                city: String(data.get('city') || '').trim(),
                state: String(data.get('state') || '').trim(),
                postal_code: String(data.get('postal_code') || '').trim(),
                country: 'US'
            }
        };
    }

    function fillDeliveryForm(shipping) {
        if (!shipping) return;
        const form = $('[data-delivery-form]');
        const values = {
            email: shipping.email,
            phone: shipping.phone,
            name: shipping.name,
            line1: shipping.address?.line1,
            line2: shipping.address?.line2,
            city: shipping.address?.city,
            state: shipping.address?.state,
            postal_code: shipping.address?.postal_code
        };
        Object.entries(values).forEach(([name, value]) => {
            const field = form.elements.namedItem(name);
            if (field && value != null) field.value = value;
        });
    }

    function renderAddress(shipping) {
        $('[data-review-name]').textContent = shipping.name;
        const street = [shipping.address.line1, shipping.address.line2].filter(Boolean).join(', ');
        $('[data-review-address]').textContent = `${street} · ${shipping.address.city}, ${shipping.address.state} ${shipping.address.postal_code}`;
        $('[data-review-contact]').textContent = [shipping.email, shipping.phone].filter(Boolean).join(' · ');
    }

    function renderTotals(session) {
        const subtotal = Number(session.subtotal || 0);
        const shipping = Number(session.shippingTotal || 0);
        const tax = Number(session.taxTotal || 0);
        const total = Number(session.total || subtotal + shipping + tax);

        $('[data-checkout-subtotal]').textContent = currency.format(subtotal);
        $('[data-checkout-shipping]').textContent = currency.format(shipping);
        $('[data-checkout-tax]').textContent = currency.format(tax);
        $('[data-checkout-total]').textContent = currency.format(total);
        $('[data-review-subtotal]').textContent = currency.format(subtotal);
        $('[data-review-shipping]').textContent = currency.format(shipping);
        $('[data-review-tax]').textContent = currency.format(tax);
        $('[data-review-total]').textContent = currency.format(total);
        $('[data-review-shipping-label]').textContent = session.shippingService || 'USPS shipping';
    }

    async function cancelSession(sessionId) {
        if (!sessionId) return;
        try {
            await requestJson(`${FUNCTIONS_URL}/cancel-stripe-checkout`, {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
                timeoutMs: 30000
            });
        } catch (error) {
            console.warn('[checkout] cancellation cleanup failed', error);
        }
    }

    async function clearActiveSession({ cancel = false } = {}) {
        const sessionId = activeSession?.sessionId;
        activeSession = null;
        saveJson(sessionStorage, SESSION_STORAGE_KEY, null);
        if (checkoutInstance?.destroy) checkoutInstance.destroy();
        checkoutInstance = null;
        $('#checkout').replaceChildren();
        if (cancel && sessionId) await cancelSession(sessionId);
    }

    async function mountCheckout(session) {
        if (!checkoutConfig?.stripePublishableKey) throw new Error('Stripe checkout is not configured.');
        if (checkoutInstance?.destroy) checkoutInstance.destroy();
        $('#checkout').replaceChildren();
        $('[data-checkout-loading]').removeAttribute('hidden');

        const stripe = Stripe(checkoutConfig.stripePublishableKey);
        checkoutInstance = await stripe.initEmbeddedCheckout({
            fetchClientSecret: async () => session.clientSecret
        });
        checkoutInstance.mount('#checkout');
        $('[data-checkout-loading]').setAttribute('hidden', '');
    }

    async function showReview(session) {
        renderAddress(session.shippingDetails);
        renderTotals(session);
        setStep('review');
        clearError();

        const liveStripe = String(checkoutConfig?.stripeEnvironment).toLowerCase() === 'live';
        if (session.uspsEnvironment === 'testing') {
            const warning = $('[data-checkout-sandbox]');
            warning.textContent = liveStripe
                ? 'Checkout is using live Stripe payments with USPS test-environment rates. Do not open checkout publicly until USPS production is enabled.'
                : 'Stripe and USPS are in test mode. No real money will be charged.';
            warning.removeAttribute('hidden');
        }
        await mountCheckout(session);
    }

    async function createReviewSession(shippingDetails) {
        const currentCartHash = cartHash(cartItems);
        const currentAddressHash = addressHash(shippingDetails);
        const stillValid = activeSession &&
            activeSession.cartHash === currentCartHash &&
            activeSession.addressHash === currentAddressHash &&
            Number(activeSession.expiresAt || 0) * 1000 > Date.now() + 60000;
        if (stillValid) return activeSession;

        if (activeSession) await clearActiveSession({ cancel: true });
        const response = await requestJson(`${FUNCTIONS_URL}/create-stripe-checkout`, {
            method: 'POST',
            body: JSON.stringify({ cart: cartItems, shippingDetails }),
            timeoutMs: 60000
        });
        if (response.checkoutFlow !== 'review_v2') {
            throw new Error('The checkout server did not start the final review flow.');
        }
        const session = {
            ...response,
            cartHash: currentCartHash,
            addressHash: currentAddressHash,
            shippingDetails
        };
        activeSession = session;
        saveJson(sessionStorage, SESSION_STORAGE_KEY, session);
        saveJson(sessionStorage, DELIVERY_STORAGE_KEY, shippingDetails);
        return session;
    }

    async function onDeliverySubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        clearError();
        if (!validateDeliveryForm(form)) return;

        const shippingDetails = formShippingDetails(form);
        saveJson(sessionStorage, DELIVERY_STORAGE_KEY, shippingDetails);
        setReviewBusy(true);
        try {
            const session = await createReviewSession(shippingDetails);
            await showReview(session);
        } catch (error) {
            console.error('[checkout] review preparation failed', error);
            showError(error.message || 'Shipping and tax could not be calculated. Your address has been kept so you can review it.');
        } finally {
            setReviewBusy(false);
        }
    }

    async function onEditAddress() {
        clearError();
        await clearActiveSession({ cancel: true });
        setStep('delivery');
        $('[name="line1"]')?.focus();
    }

    async function cleanLegacySession() {
        const legacy = loadJson(sessionStorage, LEGACY_SESSION_STORAGE_KEY);
        sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
        if (legacy?.sessionId) await cancelSession(legacy.sessionId);
    }

    async function initialize() {
        cartItems = cart();
        if (cartItems.length === 0) {
            showFatalError('Your cart is empty. Return to the shop and add an item before checking out.');
            return;
        }

        try {
            const [products, config] = await Promise.all([
                requestJson(CATALOG_URL, { method: 'POST', body: '{}' }),
                requestJson(`${FUNCTIONS_URL}/stripe-config`, { method: 'GET' })
            ]);
            catalogProducts = products;
            checkoutConfig = config;
            renderSummary(catalogProducts, cartItems);

            if (!config.checkoutEnabled || !config.stripePublishableKey) {
                throw new Error('Stripe checkout is not configured.');
            }
            const previewEnabled = new URLSearchParams(window.location.search).get('storefront-preview') === '1';
            const liveMode = String(config.stripeEnvironment).toLowerCase() === 'live';
            if (liveMode && !config.publicStorefrontEnabled && !previewEnabled) {
                throw new Error('Online checkout is not open to the public yet.');
            }
            if (!liveMode) $('[data-checkout-sandbox]').removeAttribute('hidden');

            await cleanLegacySession();
            const savedDelivery = loadJson(sessionStorage, DELIVERY_STORAGE_KEY);
            fillDeliveryForm(savedDelivery);

            const currentCartHash = cartHash(cartItems);
            const activeIsUsable = activeSession &&
                activeSession.checkoutFlow === 'review_v2' &&
                activeSession.cartHash === currentCartHash &&
                activeSession.shippingDetails &&
                Number(activeSession.expiresAt || 0) * 1000 > Date.now() + 60000;
            if (activeSession && !activeIsUsable) await clearActiveSession({ cancel: true });

            $('[data-page-loading]').setAttribute('hidden', '');
            $('[data-checkout-layout]').removeAttribute('hidden');
            if (activeIsUsable) {
                fillDeliveryForm(activeSession.shippingDetails);
                await showReview(activeSession);
            } else {
                setStep('delivery');
            }
        } catch (error) {
            console.error('[checkout] initialization error', error);
            showFatalError(error.message || 'Secure checkout could not be loaded.');
        }
    }

    $('[data-delivery-form]')?.addEventListener('submit', onDeliverySubmit);
    $('[data-delivery-form]')?.addEventListener('input', event => {
        const field = event.target;
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
            field.removeAttribute('aria-invalid');
            field.closest('.field')?.querySelector('.field-error')?.remove();
        }
    });
    $('[name="postal_code"]')?.addEventListener('input', event => {
        event.target.value = event.target.value.replace(/\D/g, '').slice(0, 5);
    });
    $('[data-edit-address]')?.addEventListener('click', onEditAddress);
    $('[data-cancel-checkout]')?.addEventListener('click', async () => {
        await clearActiveSession({ cancel: true });
        const preview = new URLSearchParams(window.location.search).get('storefront-preview') === '1';
        window.location.assign(`/${preview ? '?storefront-preview=1' : ''}`);
    });

    initialize();
})();
