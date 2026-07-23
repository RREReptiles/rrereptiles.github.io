(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v1';
    const currency = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    });
    const dateTime = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Denver'
    });

    function text(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value ?? '—';
    }

    function money(value) {
        const number = Number(value ?? 0);
        return currency.format(Number.isFinite(number) ? number : 0);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function formatAddress(shipping) {
        if (!shipping || typeof shipping !== 'object') return '';
        const address = shipping.address || shipping;
        const name = typeof shipping.name === 'string'
            ? shipping.name
            : (shipping.name?.full_name || shipping.name?.given_name || '');
        const city = address.city || address.admin_area_2 || '';
        const state = address.state || address.admin_area_1 || '';
        const postalCode = address.postal_code || '';
        const country = address.country || address.country_code || '';
        const cityLine = [city, state, postalCode].filter(Boolean).join(', ').replace(', ,', ',');
        return [
            name,
            address.line1 || address.address_line_1,
            address.line2 || address.address_line_2,
            cityLine,
            country
        ].filter(Boolean).join('\n');
    }

    function showError(message) {
        document.querySelector('[data-confirmation-loading]')?.setAttribute('hidden', '');
        document.querySelector('[data-confirmation-content]')?.setAttribute('hidden', '');
        const error = document.querySelector('[data-confirmation-error]');
        error?.removeAttribute('hidden');
        text('[data-confirmation-error-message]', message);
    }

    function clearCompletedCheckout() {
        localStorage.removeItem(CART_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }

    function renderOrder(order) {
        clearCompletedCheckout();
        document.querySelector('[data-confirmation-loading]')?.setAttribute('hidden', '');
        document.querySelector('[data-confirmation-error]')?.setAttribute('hidden', '');
        document.querySelector('[data-confirmation-content]')?.removeAttribute('hidden');

        text('[data-order-number]', order.orderNumber);
        text('[data-order-date]', order.paidAt ? dateTime.format(new Date(order.paidAt)) : 'Payment received');
        text('[data-customer-name]', order.customerName || 'Customer');
        text('[data-customer-email]', order.customerEmail || 'Email not provided');
        text('[data-order-subtotal]', money(order.subtotal));
        text('[data-order-shipping]', money(order.shippingTotal));
        text('[data-order-tax]', money(order.taxTotal));
        text('[data-order-total]', money(order.total));

        const testMode = order.stripeLivemode === false;
        const emailStatus = order.receiptEmailSent
            ? `Sent to ${order.customerEmail || 'the checkout email'}`
            : (testMode ? 'Not sent for this Stripe test order' : 'Store email pending');
        text('[data-email-status]', emailStatus);

        const taxRow = document.querySelector('[data-tax-row]');
        if (Number(order.taxTotal || 0) > 0) taxRow?.removeAttribute('hidden');
        else taxRow?.setAttribute('hidden', '');

        if (testMode) document.querySelector('[data-confirmation-sandbox]')?.removeAttribute('hidden');

        const itemsContainer = document.querySelector('[data-order-items]');
        const items = Array.isArray(order.items) ? order.items : [];
        if (itemsContainer) {
            itemsContainer.innerHTML = items.map(item => `
                <div class="confirmation-item">
                    <div>
                        <div class="confirmation-item-name">${escapeHtml(item.productName)}</div>
                        <div class="confirmation-item-price">${money(item.unitPrice)} each</div>
                    </div>
                    <div class="confirmation-item-quantity">Qty ${escapeHtml(item.quantity)}</div>
                    <div class="confirmation-item-total">${money(item.lineTotal)}</div>
                </div>
            `).join('');
        }

        const address = formatAddress(order.shippingAddress);
        if (address) text('[data-shipping-address]', address);
        else document.querySelector('[data-shipping-section]')?.setAttribute('hidden', '');
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
        if (!response.ok) throw new Error(payload.error || 'The order confirmation could not be loaded.');
        return payload;
    }

    async function loadBySession(sessionId) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const payload = await requestJson(`${SUPABASE_URL}/functions/v1/stripe-session-status`, {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
            if (payload.status === 'complete' && payload.order) {
                const token = payload.order.confirmationToken;
                if (token) history.replaceState({}, '', `order-confirmation.html?token=${encodeURIComponent(token)}`);
                renderOrder(payload.order);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error('Stripe is still confirming this payment. Refresh this page in a moment.');
    }

    async function loadByToken(token) {
        const payload = await requestJson(`${SUPABASE_URL}/functions/v1/order-confirmation?token=${encodeURIComponent(token)}`);
        renderOrder(payload);
    }

    async function loadOrder() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id')?.trim() || '';
        const token = params.get('token')?.trim() || '';
        try {
            if (/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
                await loadBySession(sessionId);
                return;
            }
            if (/^[0-9a-f-]{36}$/i.test(token)) {
                await loadByToken(token);
                return;
            }
            showError('This confirmation link is missing its Stripe session or order token.');
        } catch (error) {
            console.error('[order-confirmation]', error);
            showError(error.message || 'The order confirmation could not be loaded.');
        }
    }

    document.querySelector('[data-print-order]')?.addEventListener('click', () => window.print());
    loadOrder();
})();
