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

    function installShopPolishStyles() {
        if (document.querySelector('style[data-shop-polish]')) return;
        const style = document.createElement('style');
        style.dataset.shopPolish = '';
        style.textContent = `
            #page-shop .shop-notice,
            #page-shop > .contact-strip,
            #page-shop #shop-online-store,
            #page-shop .storefront-tab {
                display: none !important;
            }

            #page-shop .storefront-header {
                position: relative;
                overflow: hidden;
                padding: 1.35rem 1.5rem;
                border: 1px solid rgba(158, 20, 3, .14);
                border-top: 4px solid var(--accent);
                background: linear-gradient(145deg, #ffffff 0%, #fbf7f1 100%);
                box-shadow: 0 10px 30px rgba(0, 0, 0, .08);
            }

            #page-shop .storefront-header::after {
                content: '';
                position: absolute;
                top: -70px;
                right: -45px;
                width: 190px;
                height: 190px;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(158, 20, 3, .09), transparent 68%);
                pointer-events: none;
            }

            #page-shop .storefront-header > * {
                position: relative;
                z-index: 1;
            }

            #page-shop .storefront-header h3 {
                font-family: 'Playfair Display', Georgia, serif;
                font-size: clamp(1.35rem, 2.5vw, 1.7rem);
                line-height: 1.2;
            }

            #page-shop .storefront-header p {
                max-width: 760px;
                margin-top: .45rem;
                font-size: .92rem;
                line-height: 1.55;
            }

            #page-shop .shop-tabs {
                margin-top: 1.35rem;
            }

            @media (max-width: 600px) {
                #page-shop .storefront-header {
                    padding: 1.2rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function professionalizeShopPage() {
        const shopPage = document.getElementById('page-shop');
        if (!shopPage) return;

        shopPage.querySelector('.shop-notice')?.remove();
        shopPage.querySelector('#shop-online-store')?.remove();
        shopPage.querySelectorAll('.storefront-tab').forEach(element => element.remove());
        Array.from(shopPage.children)
            .filter(element => element.classList?.contains('contact-strip'))
            .forEach(element => element.remove());

        const header = shopPage.querySelector('[data-storefront-header]');
        if (header) {
            const heading = header.querySelector('h3');
            const description = header.querySelector('p');
            if (heading && heading.textContent !== 'Shop Available Products') {
                heading.textContent = 'Shop Available Products';
            }
            const polishedDescription = 'Browse reptiles, aquatic plants, feeders, supplements, enclosure supplies, and handcrafted goods. Eligible items can be purchased securely online; live animals and custom orders may require direct inquiry.';
            if (description && description.textContent !== polishedDescription) {
                description.textContent = polishedDescription;
            }
        }

        const status = shopPage.querySelector('[data-storefront-status]');
        if (status) {
            const text = status.textContent || '';
            if (/loading current inventory/i.test(text)) {
                status.textContent = 'Loading products…';
            } else if (/could not load current inventory/i.test(text)) {
                status.innerHTML = 'We could not load the shop right now. Please refresh or <a href="mailto:rrereptiles@gmail.com">contact us</a>.';
            }
        }

        const checkoutStatus = document.querySelector('[data-storefront-checkout-status]');
        if (checkoutStatus && /shipping details are verified|become purchasable/i.test(checkoutStatus.textContent || '')) {
            checkoutStatus.textContent = 'Add an item to your cart to begin secure checkout.';
        }

        document.querySelectorAll('[data-storefront-cart-limit]').forEach(element => element.remove());
    }

    function updateCustomerPurchaseCopy() {
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
                answer.innerHTML = '<p>Products marked <strong>Add to Cart</strong> can be purchased through secure Stripe checkout. For live animals, custom orders, or products marked <strong>Inquire</strong>, contact us at 970-400-1278, email <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a>, or reach out through social media or MorphMarket.</p>';
            }
        });
    }

    function observeShopChanges() {
        const shopPage = document.getElementById('page-shop');
        if (!shopPage || shopPage.dataset.shopPolishObserved === 'true') return;
        shopPage.dataset.shopPolishObserved = 'true';
        let queued = false;
        const observer = new MutationObserver(() => {
            if (queued) return;
            queued = true;
            window.requestAnimationFrame(() => {
                queued = false;
                professionalizeShopPage();
            });
        });
        observer.observe(shopPage, { childList: true, subtree: true, characterData: true });
    }

    async function initializeStorefrontGate() {
        installShopPolishStyles();
        professionalizeShopPage();
        observeShopChanges();

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
        updateCustomerPurchaseCopy();
        professionalizeShopPage();

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
