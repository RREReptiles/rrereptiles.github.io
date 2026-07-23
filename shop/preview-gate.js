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

    function updatePurchaseCopy() {
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

    function waitForStorefrontShell(timeoutMs = 5000) {
        const existing = document.getElementById('shop-online-store');
        if (existing) return Promise.resolve(existing);

        return new Promise(resolve => {
            const observer = new MutationObserver(() => {
                const shell = document.getElementById('shop-online-store');
                if (!shell) return;
                clearTimeout(timer);
                observer.disconnect();
                resolve(shell);
            });
            const timer = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
            observer.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    function promoteStorefrontToShopPage(onlineCategory, previewEnabled, config) {
        const shopPage = document.getElementById('page-shop');
        const section = shopPage?.querySelector(':scope > .section');
        if (!shopPage || !section || !onlineCategory) return;

        const intro = document.createElement('div');
        intro.className = 'storefront-page-intro';
        intro.innerHTML = `
            <h2 class="section-title">Our <span class="accent">Shop</span></h2>
            <div class="divider"></div>
            <p class="section-subtitle">Browse products managed through our live ReptiTrax catalog. Pricing is current; products marked out of stock are still being prepared for online shipping.</p>
        `;

        onlineCategory.classList.remove('shop-category', 'active');
        onlineCategory.classList.add('storefront-page-content');

        if (previewEnabled && !onlineCategory.querySelector('.storefront-preview-notice')) {
            const notice = document.createElement('div');
            notice.className = 'storefront-preview-notice';
            const testMode = String(config?.stripeEnvironment || 'test').toLowerCase() !== 'live';
            notice.textContent = testMode
                ? 'Sandbox preview: Stripe uses test cards and does not create a real charge.'
                : 'Private production preview: this checkout uses real payment methods.';
            onlineCategory.prepend(notice);
        }

        section.replaceChildren(intro, onlineCategory);
        section.setAttribute('aria-label', 'Online shop');
        document.body.classList.add('storefront-full-shop');

        if (previewEnabled) {
            const shopLink = document.querySelector('.nav-links [data-page="shop"]')
                || document.querySelector('[data-page="shop"]');
            shopLink?.click();
        }
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

        const onlineCategory = await waitForStorefrontShell();
        if (!onlineCategory) {
            console.warn('[storefront] storefront shell was not created');
            return;
        }
        promoteStorefrontToShopPage(onlineCategory, previewEnabled, config);
    }

    loadStorefrontCardStyles();
    initializeStorefrontGate();
})();