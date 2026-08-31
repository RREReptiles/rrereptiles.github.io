(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_PATH = '/rest/v1/rpc/get_storefront_catalog';
    const CANCEL_URL = `${SUPABASE_URL}/functions/v1/cancel-stripe-checkout`;
    const CART_STORAGE_KEY = 'rre-storefront-cart-v1';
    const SESSION_STORAGE_KEY = 'rre-stripe-checkout-session-v1';
    const CORE_SRC = '/shop/preview-gate-core.js?v=20260831-1';
    let staleCleanupPromise = Promise.resolve();

    function loadCart() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(item => (
                Number.isInteger(item?.itemId)
                && item.itemId > 0
                && Number.isInteger(item?.quantity)
                && item.quantity > 0
            ));
        } catch (_) {
            return [];
        }
    }

    function cartHash(items = loadCart()) {
        return JSON.stringify([...items].sort((a, b) => a.itemId - b.itemId));
    }

    function loadSession() {
        try {
            const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || 'null');
            if (!session || typeof session !== 'object') return null;
            if (!session.sessionId || !session.cartHash) return null;
            const expiresAt = Number(session.expiresAt || 0) * 1000;
            return {
                ...session,
                expiresAtMs: Number.isFinite(expiresAt) ? expiresAt : 0
            };
        } catch (_) {
            return null;
        }
    }

    function activeSession() {
        const session = loadSession();
        if (!session || session.expiresAtMs <= Date.now()) return null;
        return session.cartHash === cartHash() ? session : null;
    }

    function sessionItems(session) {
        if (!session?.cartHash) return [];
        try {
            const parsed = JSON.parse(session.cartHash);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(item => (
                Number.isInteger(item?.itemId)
                && item.itemId > 0
                && Number.isInteger(item?.quantity)
                && item.quantity > 0
            ));
        } catch (_) {
            return [];
        }
    }

    function reservationMap(session = activeSession()) {
        const reserved = new Map();
        sessionItems(session).forEach(item => {
            reserved.set(item.itemId, (reserved.get(item.itemId) || 0) + item.quantity);
        });
        return reserved;
    }

    function isCatalogRequest(input) {
        const url = typeof input === 'string' ? input : input?.url;
        return typeof url === 'string' && url.includes(CATALOG_PATH);
    }

    function patchCatalog(products) {
        const session = activeSession();
        if (!session || !Array.isArray(products)) return products;

        const reserved = reservationMap(session);
        return products.map(product => {
            const itemId = Number(product?.item_id);
            const reservedQuantity = reserved.get(itemId) || 0;
            if (reservedQuantity <= 0) return product;

            const available = Math.max(0, Number(product.available_quantity || 0));
            return {
                ...product,
                available_quantity: available + reservedQuantity,
                in_stock: true
            };
        });
    }

    function installCatalogPatch() {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const catalogRequest = isCatalogRequest(input);
            if (catalogRequest) await staleCleanupPromise;
            const response = await originalFetch(input, init);
            if (!catalogRequest || !response.ok || !activeSession()) return response;

            try {
                const products = await response.clone().json();
                const body = JSON.stringify(patchCatalog(products));
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.warn('[storefront-reservation] catalog patch skipped', error);
                return response;
            }
        };
    }

    async function cancelSession(session) {
        if (!session?.sessionId) return true;
        const response = await fetch(CANCEL_URL, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: session.sessionId })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || payload.message || `Checkout release failed (${response.status})`);
        }
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        return true;
    }

    function setCartStatus(message, type = '') {
        const status = document.querySelector('[data-storefront-checkout-status]');
        if (!status) return;
        status.textContent = message;
        status.className = `storefront-checkout-status ${type}`.trim();
    }

    function installCartEditGuard() {
        document.addEventListener('click', async event => {
            const resume = event.target.closest?.('[data-storefront-reservation-resume]');
            if (resume) {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.location.assign('/checkout.html');
                return;
            }

            const edit = event.target.closest?.(
                '[data-storefront-add], [data-storefront-remove], [data-storefront-increase], [data-storefront-decrease]'
            );
            const session = activeSession();
            if (!edit || !session) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            edit.disabled = true;
            setCartStatus('Updating your reserved checkout…');

            try {
                await cancelSession(session);
                edit.disabled = false;
                edit.click();
            } catch (error) {
                console.error('[storefront-reservation] checkout release failed', error);
                edit.disabled = false;
                setCartStatus(
                    'Your reserved checkout could not be released. Please try again before changing the cart.',
                    'error'
                );
            }
        }, true);
    }

    function syncReservationUi() {
        const session = activeSession();
        if (!session) return;
        const reserved = reservationMap(session);

        document.querySelectorAll('[data-storefront-item-id]').forEach(card => {
            const itemId = Number(card.dataset.storefrontItemId);
            if ((reserved.get(itemId) || 0) <= 0) return;

            const stock = card.querySelector('[data-storefront-stock-label]');
            if (stock && stock.textContent !== 'Reserved in your cart') {
                stock.textContent = 'Reserved in your cart';
            }

            const action = card.querySelector('[data-storefront-action]');
            if (action && action.matches('[data-storefront-add]')) {
                action.dataset.storefrontReservationResume = '';
                if (action.textContent !== 'Resume Checkout') action.textContent = 'Resume Checkout';
            }
        });

        const checkoutButton = document.querySelector('[data-storefront-checkout]');
        if (checkoutButton && !checkoutButton.disabled) {
            checkoutButton.textContent = 'Resume Secure Checkout';
            setCartStatus('This inventory is reserved for your active Stripe checkout.');
        }

        sessionItems(session).forEach(item => {
            const cartButton = document.querySelector(`[data-storefront-remove="${item.itemId}"]`);
            const row = cartButton?.closest('.storefront-cart-item');
            const price = row?.querySelector('.storefront-cart-item-price');
            if (!price || price.querySelector('[data-storefront-reservation-note]')) return;
            const note = document.createElement('span');
            note.dataset.storefrontReservationNote = '';
            note.textContent = ' · Reserved for this checkout';
            price.appendChild(note);
        });
    }

    function observeReservationUi() {
        let queued = false;
        const observer = new MutationObserver(() => {
            if (queued) return;
            queued = true;
            window.requestAnimationFrame(() => {
                queued = false;
                syncReservationUi();
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', syncReservationUi, { once: true });
        } else {
            syncReservationUi();
        }
    }

    async function releaseStaleSession() {
        const session = loadSession();
        if (!session) return;
        const expired = session.expiresAtMs <= Date.now();
        const cartChanged = session.cartHash !== cartHash();
        if (!expired && !cartChanged) return;

        try {
            await cancelSession(session);
        } catch (error) {
            console.warn('[storefront-reservation] stale checkout cleanup deferred', error);
        }
    }

    function loadCore() {
        if (document.querySelector('script[data-preview-gate-core]')) return;
        const script = document.createElement('script');
        script.src = CORE_SRC;
        script.defer = true;
        script.dataset.previewGateCore = '';
        document.head.appendChild(script);
    }

    async function bootstrap() {
        installCatalogPatch();
        installCartEditGuard();
        observeReservationUi();
        staleCleanupPromise = releaseStaleSession();
        await staleCleanupPromise;
        loadCore();
    }

    bootstrap();
})();
