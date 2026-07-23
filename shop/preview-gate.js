(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';

    function updatePurchaseCopy() {
        const shopPage = document.getElementById('page-shop');
        const shopNotice = shopPage?.querySelector('.shop-notice');
        if (shopNotice) {
            shopNotice.innerHTML = '<strong>How to Purchase:</strong> Eligible dry goods can be purchased securely through our online Stripe checkout. Live-animal sales and special-order items are handled by direct inquiry or MorphMarket.';
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
                answer.innerHTML = '<p>Contact us at 970-400-1278, email <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a>, or reach out through our social media or MorphMarket. Online Stripe checkout is available for products specifically marked for checkout.</p>';
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

        const shopPage = document.getElementById('page-shop');
        const onlineCategory = document.getElementById('shop-online-store');
        const onlineTab = document.querySelector('.storefront-tab');
        if (!shopPage || !onlineCategory || !onlineTab) return;

        if (previewEnabled) {
            const notice = document.createElement('div');
            notice.className = 'storefront-preview-notice';
            const testMode = String(config?.stripeEnvironment || 'test').toLowerCase() !== 'live';
            notice.textContent = testMode
                ? 'Sandbox preview: Stripe uses test cards and does not create a real charge.'
                : 'Private production preview: this checkout uses real payment methods.';
            onlineCategory.prepend(notice);

            const shopLink = document.querySelector('.nav-links [data-page="shop"]')
                || document.querySelector('[data-page="shop"]');
            shopLink?.click();
            onlineTab.click();
        }
    }

    initializeStorefrontGate();
})();
