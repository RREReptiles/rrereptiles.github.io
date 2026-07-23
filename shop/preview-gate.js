(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';

    function loadStorefrontCardStyles() {
        if (document.querySelector('link[data-storefront-card-sizing]')) return;
        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = 'shop/storefront-card-sizing.css?v=20260723';
        stylesheet.dataset.storefrontCardSizing = '';
        document.head.appendChild(stylesheet);
    }

    function loadStorefrontPhotoSync() {
        if (document.querySelector('script[data-storefront-photo-sync]')) return;
        const script = document.createElement('script');
        script.src = 'shop/storefront-photo-sync.js?v=20260724';
        script.defer = true;
        script.dataset.storefrontPhotoSync = '';
        document.head.appendChild(script);
    }

    function updatePurchaseCopy() {
        const shopPage = document.getElementById('page-shop');
        const shopNotice = shopPage?.querySelector('.shop-notice');
        if (shopNotice) {
            shopNotice.innerHTML = '<strong>Online Catalog:</strong> Browse products by category below. Products marked out of stock are being prepared for online fulfillment. Live-animal sales and special orders remain available by direct inquiry or MorphMarket.';
        }

        document.querySelectorAll('.ship-card').forEach(card => {
            const heading = card.querySelector('h3')?.textContent || '';
            if (!heading.includes('Payment Methods')) return;
            card.innerHTML = `
                <h3>&#128176; Payment Methods</h3>
                <ul>
                    <li>Secure Stripe checkout for eligible online products</li>
                    <li>Major credit and debit cards</li>
                    <li>Eligible digital wallets shown during checkout</li>
                    <li>MorphMarket for supported live-animal sales</li>
                </ul>
            `;
        });

        document.querySelectorAll('.faq-item').forEach(item => {
            const question = item.querySelector('.faq-question')?.textContent || '';
            if (!question.includes('How do I purchase a reptile')) return;
            const answer = item.querySelector('.faq-answer');
            if (answer) {
                answer.innerHTML = '<p>Contact us at 970-400-1278, email <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a>, or reach out through our social media or MorphMarket. Secure Stripe checkout appears on products that are enabled for online purchase.</p>';
            }
        });
    }

    async function initializeStorefrontGate() {
        const params = new URLSearchParams(window.location.search);
        const previewEnabled = params.get('storefront-preview') === '1';
        let config = null;

        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-config`, {
                headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
            });
            if (response.ok) config = await response.json();
        } catch (error) {
            console.warn('[storefront] launch configuration unavailable', error);
        }

        const publicEnabled = config?.publicStorefrontEnabled === true;
        if (!previewEnabled && !publicEnabled) return;

        document.body.classList.add('storefront-preview-enabled');
        updatePurchaseCopy();

        if (!previewEnabled) return;

        const section = document.querySelector('#page-shop > .section');
        if (section && !section.querySelector('.storefront-preview-notice')) {
            const notice = document.createElement('div');
            notice.className = 'storefront-preview-notice';
            const testMode = String(config?.stripeEnvironment || 'test').toLowerCase() !== 'live';
            notice.textContent = testMode
                ? 'Sandbox preview: Stripe uses test cards and does not create a real charge.'
                : 'Private production preview: this checkout uses real payment methods.';
            section.prepend(notice);
        }

        const shopLink = document.querySelector('.nav-links [data-page="shop"]')
            || document.querySelector('[data-page="shop"]');
        shopLink?.click();
    }

    loadStorefrontCardStyles();
    loadStorefrontPhotoSync();
    initializeStorefrontGate();
})();
