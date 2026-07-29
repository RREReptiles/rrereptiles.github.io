(() => {
    'use strict';

    const CATALOG_URL = "https://zezpkoulxjagljjbyhhk.supabase.co/rest/v1/rpc/get_storefront_catalog";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv";
    const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    function isLocalPickupOnly(product) {
        return product?.local_pickup_only === true || product?.store_category === 'feeders';
    }

    function purchaseMode(product) {
        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;
    }

    function productPrice(product) {
        const display = String(product.display_price_text || '').trim();
        if (display) return display.replace(/\.00(?=\s|$)/, '');
        return currency.format(Number(product.price || 0));
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

    function applyProduct(product) {
        const action = document.querySelector('[data-product-action]');
        const price = document.querySelector('[data-product-price]');
        const stock = document.querySelector('[data-product-stock]');
        const notice = document.querySelector('[data-product-notice]');
        if (!action || !price || !stock || !notice) return;

        price.textContent = productPrice(product);
        stock.textContent = product.in_stock ? 'In stock' : 'Out of stock';
        stock.classList.toggle('available', Boolean(product.in_stock));

        if (!product.in_stock) {
            notice.innerHTML = '<strong>Currently unavailable.</strong> Our inventory system reports this item as out of stock.';
            setAction(action, 'Out of Stock');
            return;
        }

        if (purchaseMode(product) === 'checkout') {
            notice.innerHTML = '<strong>Online checkout available.</strong> Add to Cart uses the original storefront cart and verifies current quantity limits.';
            setAction(action, 'Add to Cart', `/?add=${encodeURIComponent(product.item_id)}#shop`);
            return;
        }

        if (isLocalPickupOnly(product)) {
            notice.innerHTML = '<strong>Colorado local pickup only.</strong> Use Inquire to confirm availability, quantity, pricing, and pickup arrangements.';
        } else {
            notice.innerHTML = '<strong>Contact to order.</strong> Availability and fulfillment will be confirmed before payment.';
        }
        setAction(
            action,
            'Inquire',
            `mailto:rrereptiles@gmail.com?subject=${encodeURIComponent(`Inquiry about ${product.public_name}`)}`
        );
    }

    async function init() {
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
            applyProduct(product);
        } catch (error) {
            console.error('[product-page] catalog error', error);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
