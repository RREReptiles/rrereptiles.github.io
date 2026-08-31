(() => {
    'use strict';

    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v1';

    function loadCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
            return Array.isArray(parsed)
                ? parsed.filter(item => Number.isInteger(item?.itemId) && Number.isInteger(item?.quantity) && item.quantity > 0)
                : [];
        } catch (_) {
            return [];
        }
    }

    function cartHash(items) {
        return JSON.stringify([...items].sort((a, b) => a.itemId - b.itemId));
    }

    function loadActiveSession(cart) {
        try {
            const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || 'null');
            if (!session || typeof session !== 'object') return null;
            const expiresAt = Number(session.expiresAt || 0) * 1000;
            if (!session.sessionId || !session.cartHash || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                sessionStorage.removeItem(SESSION_STORAGE_KEY);
                return null;
            }
            return session.cartHash === cartHash(cart) ? session : null;
        } catch (_) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            return null;
        }
    }

    function reservedQuantity(session, itemId) {
        if (!session?.cartHash) return 0;
        try {
            const items = JSON.parse(session.cartHash);
            if (!Array.isArray(items)) return 0;
            return items
                .filter(item => Number(item?.itemId) === itemId)
                .reduce((sum, item) => sum + Math.max(0, Number(item?.quantity) || 0), 0);
        } catch (_) {
            return 0;
        }
    }

    function applyReservationState() {
        const itemId = Number(document.body.dataset.storefrontItemId);
        if (!Number.isInteger(itemId) || itemId <= 0) return false;

        const cart = loadCart();
        const session = loadActiveSession(cart);
        if (!session || reservedQuantity(session, itemId) <= 0) return false;

        const stock = document.querySelector('[data-product-stock]');
        const action = document.querySelector('[data-product-action]');
        const fulfillment = document.querySelector('[data-product-fulfillment]');
        if (!stock || !action) return false;

        if (stock.textContent !== 'Reserved in your cart') stock.textContent = 'Reserved in your cart';
        stock.classList.add('available');

        if (action.textContent !== 'Resume Checkout') action.textContent = 'Resume Checkout';
        if (action.getAttribute('href') !== '/checkout.html') action.setAttribute('href', '/checkout.html');
        action.removeAttribute('aria-disabled');

        if (fulfillment) {
            const message = 'This item is reserved for your active checkout.';
            if (fulfillment.textContent !== message) fulfillment.textContent = message;
            fulfillment.hidden = false;
        }
        return true;
    }

    function init() {
        if (applyReservationState()) return;

        const observer = new MutationObserver(() => {
            if (applyReservationState()) observer.disconnect();
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-storefront-item-id']
        });
        window.setTimeout(() => observer.disconnect(), 15000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
