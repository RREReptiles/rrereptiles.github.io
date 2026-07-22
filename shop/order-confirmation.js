(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
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

        const name = shipping.name?.full_name || shipping.name?.given_name || '';
        const address = shipping.address || shipping;
        const cityLine = [address.admin_area_2, address.admin_area_1, address.postal_code]
            .filter(Boolean)
            .join(', ')
            .replace(', ,', ',');

        return [
            name,
            address.address_line_1,
            address.address_line_2,
            cityLine,
            address.country_code
        ].filter(Boolean).join('\n');
    }

    function showError(message) {
        document.querySelector('[data-confirmation-loading]')?.setAttribute('hidden', '');
        document.querySelector('[data-confirmation-content]')?.setAttribute('hidden', '');
        const error = document.querySelector('[data-confirmation-error]');
        error?.removeAttribute('hidden');
        text('[data-confirmation-error-message]', message);
    }

    function renderOrder(order) {
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

        const emailStatus = order.receiptEmailSent
            ? `Sent to ${order.customerEmail || 'your PayPal email'}`
            : 'PayPal receipt available; store email pending';
        text('[data-email-status]', emailStatus);

        const taxRow = document.querySelector('[data-tax-row]');
        if (Number(order.taxTotal || 0) > 0) taxRow?.removeAttribute('hidden');

        const sandbox = String(order.customerEmail || '').endsWith('@personal.example.com');
        if (sandbox) document.querySelector('[data-confirmation-sandbox]')?.removeAttribute('hidden');

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
        if (address) {
            text('[data-shipping-address]', address);
        } else {
            document.querySelector('[data-shipping-section]')?.setAttribute('hidden', '');
        }
    }

    async function loadOrder() {
        const token = new URLSearchParams(window.location.search).get('token')?.trim() || '';
        if (!/^[0-9a-f-]{36}$/i.test(token)) {
            showError('This confirmation link is missing its order token.');
            return;
        }

        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/order-confirmation?token=${encodeURIComponent(token)}`, {
                headers: {
                    apikey: SUPABASE_PUBLISHABLE_KEY
                }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'The order confirmation could not be loaded.');
            }
            renderOrder(payload);
        } catch (error) {
            console.error('[order-confirmation]', error);
            showError(error.message || 'The order confirmation could not be loaded.');
        }
    }

    document.querySelector('[data-print-order]')?.addEventListener('click', () => window.print());
    loadOrder();
})();
