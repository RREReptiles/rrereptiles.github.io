(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';
    const CATALOG_URL = `${SUPABASE_URL}/rest/v1/rpc/get_storefront_catalog`;

    const products = new Map();
    let applyQueued = false;

    function quantityAvailable(product) {
        return Math.max(0, Number(product?.available_quantity || 0));
    }

    function maximumPurchasable(product) {
        const available = quantityAvailable(product);
        if (product?.max_per_order == null) return available;
        return Math.max(0, Math.min(available, Number(product.max_per_order)));
    }

    function isStockLimit(product, maximum) {
        const available = quantityAvailable(product);
        const configured = product?.max_per_order == null
            ? null
            : Math.max(0, Number(product.max_per_order));
        return maximum === available && (configured == null || available <= configured);
    }

    function lowStockText(product) {
        if (product?.low_stock !== true || product?.in_stock !== true) return null;
        const available = quantityAvailable(product);
        return product.show_quantity === true
            ? `Only ${available} left`
            : 'Low stock';
    }

    function updateProductCards() {
        document.querySelectorAll('[data-storefront-item-id]').forEach(card => {
            const itemId = Number(card.dataset.storefrontItemId);
            const product = products.get(itemId);
            const stockLabel = card.querySelector('[data-storefront-stock-label]');
            if (!product || !stockLabel) return;

            const warning = lowStockText(product);
            stockLabel.classList.toggle('low', Boolean(warning));
            if (warning && stockLabel.textContent !== warning) {
                stockLabel.textContent = warning;
            }
        });
    }

    function cartQuantity(row) {
        const quantity = row.querySelector('.storefront-quantity-controls span');
        const parsed = Number(quantity?.textContent || 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function cartLimitMessage(product, maximum) {
        if (isStockLimit(product, maximum)) {
            const available = quantityAvailable(product);
            return product.show_quantity === true
                ? `All ${available} currently available are in your cart.`
                : 'You have the full available stock in your cart.';
        }
        return `Maximum ${maximum} per order.`;
    }

    function updateCartWarnings() {
        document.querySelectorAll('.storefront-cart-item').forEach(row => {
            const increaseButton = row.querySelector('[data-storefront-increase]');
            if (!increaseButton) return;

            const itemId = Number(increaseButton.dataset.storefrontIncrease);
            const product = products.get(itemId);
            if (!product) return;

            const maximum = maximumPurchasable(product);
            const quantity = cartQuantity(row);
            const atMaximum = maximum > 0 && quantity >= maximum;

            increaseButton.disabled = atMaximum;
            increaseButton.setAttribute('aria-disabled', atMaximum ? 'true' : 'false');
            increaseButton.title = atMaximum
                ? cartLimitMessage(product, maximum)
                : 'Increase quantity';

            const details = row.children[1];
            if (!details) return;

            let warning = details.querySelector('[data-storefront-cart-limit]');
            if (!atMaximum) {
                warning?.remove();
                return;
            }

            const message = cartLimitMessage(product, maximum);
            if (!warning) {
                warning = document.createElement('p');
                warning.className = 'storefront-cart-limit-note';
                warning.dataset.storefrontCartLimit = '';
                warning.setAttribute('role', 'status');
                details.appendChild(warning);
            }
            if (warning.textContent !== message) warning.textContent = message;
        });
    }

    function applyWarnings() {
        applyQueued = false;
        updateProductCards();
        updateCartWarnings();
    }

    function queueApply() {
        if (applyQueued) return;
        applyQueued = true;
        window.requestAnimationFrame(applyWarnings);
    }

    async function loadCatalog() {
        try {
            const response = await fetch(CATALOG_URL, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    'Content-Type': 'application/json'
                },
                body: '{}'
            });
            if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);

            const rows = await response.json();
            if (!Array.isArray(rows)) throw new Error('Catalog response was invalid.');

            products.clear();
            rows.forEach(product => products.set(Number(product.item_id), product));
            queueApply();
        } catch (error) {
            console.warn('[storefront] inventory warnings unavailable', error);
        }
    }

    function init() {
        const observer = new MutationObserver(queueApply);
        observer.observe(document.body, { childList: true, subtree: true });
        loadCatalog();
        queueApply();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
