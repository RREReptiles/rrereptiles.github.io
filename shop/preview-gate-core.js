(() => {
    'use strict';

    const SUPABASE_URL = 'https://zezpkoulxjagljjbyhhk.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w1szxATkVRFs2JBQOyG8rg_ULipgOPv';

    const SHOP_CATEGORY_COPY = {
        all: {
            title: 'All Products',
            description: 'Browse everything currently available across every shop category.'
        },
        animals: {
            title: 'Animals',
            description: 'Reptiles and other animals currently available from our collection.'
        },
        plants: {
            title: 'Aquatic Plants',
            description: 'Aquarium plants grown submerged for a smoother transition into your tank.'
        },
        'tropical-plants': {
            title: 'Tropical Plants',
            description: 'Terrarium and tropical plants for planted enclosures and bioactive habitats.'
        },
        shrimp: {
            title: 'Freshwater Shrimp',
            description: 'Freshwater shrimp, colony releases, and upcoming color varieties.'
        },
        feeders: {
            title: 'Insects & Feeders',
            description: 'Live feeders, cultures, and microfauna available for local pickup.'
        },
        'dietary-supplements': {
            title: 'Diet & Supplements',
            description: 'Nutrition, calcium, vitamins, and water-care essentials.'
        },
        'husbandry-supplies': {
            title: 'Husbandry Supplies',
            description: 'Hides, ledges, bowls, tools, décor, and custom enclosure goods.'
        },
        entomology: {
            title: 'Entomology Art',
            description: 'Pinned specimens and display-ready natural-history pieces.'
        }
    };

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
        script.src = 'shop/storefront-photo-sync.js?v=20260830-1';
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
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: .9rem;
                margin: 1.35rem 0 2.35rem;
                padding: 0 0 1.5rem;
                border-bottom: 1px solid rgba(26, 26, 26, .1);
            }

            #page-shop .shop-tab {
                --shop-category-image: none;
                position: relative;
                isolation: isolate;
                display: flex;
                min-height: 128px;
                overflow: hidden;
                flex-direction: column;
                align-items: flex-start;
                justify-content: flex-end;
                gap: .25rem;
                padding: 1.05rem 1.1rem;
                border: 1px solid rgba(26, 26, 26, .12);
                border-radius: 14px;
                background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(250,247,241,.97));
                color: var(--black);
                text-align: left;
                box-shadow: 0 5px 18px rgba(0, 0, 0, .065);
                transform: translate3d(0, 0, 0);
                transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease, color .24s ease;
            }

            #page-shop .shop-tab::before {
                content: '';
                position: absolute;
                inset: -7px;
                z-index: -2;
                background-image: linear-gradient(100deg, rgba(255,255,255,.8) 12%, rgba(255,255,255,.28) 100%), var(--shop-category-image);
                background-position: center;
                background-size: cover;
                opacity: .1;
                filter: saturate(.8) contrast(1.03);
                transform: scale(1.03) translate3d(0, 0, 0);
                transition: opacity .3s ease, transform .42s cubic-bezier(.2,.7,.2,1), filter .3s ease;
                pointer-events: none;
            }

            #page-shop .shop-tab::after {
                content: '';
                position: absolute;
                right: 0;
                bottom: 0;
                left: 0;
                z-index: 2;
                height: 3px;
                background: linear-gradient(90deg, var(--accent), #c62b10 58%, rgba(198,43,16,.18));
                transform: scaleX(0);
                transform-origin: left;
                transition: transform .28s ease;
                pointer-events: none;
            }

            #page-shop .shop-tab:hover {
                color: var(--black);
                border-color: rgba(158, 20, 3, .32);
                background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(253,247,242,.99));
                box-shadow: 0 11px 28px rgba(0, 0, 0, .11);
                transform: translate3d(3px, -4px, 0);
            }

            #page-shop .shop-tab:hover::before {
                opacity: .15;
                filter: saturate(.95) contrast(1.05);
                transform: scale(1.08) translate3d(5px, -1px, 0);
            }

            #page-shop .shop-tab:hover::after,
            #page-shop .shop-tab.active::after {
                transform: scaleX(1);
            }

            #page-shop .shop-tab.active {
                color: var(--black);
                border-color: rgba(158, 20, 3, .55);
                background: linear-gradient(145deg, rgba(255,255,255,.99), rgba(255,244,239,.98));
                box-shadow: 0 9px 26px rgba(158, 20, 3, .14);
            }

            #page-shop .shop-tab.active::before {
                opacity: .13;
                filter: saturate(.95) contrast(1.05);
            }

            #page-shop .shop-category-title,
            #page-shop .shop-category-description,
            #page-shop .shop-category-action {
                position: relative;
                z-index: 1;
                pointer-events: none;
            }

            #page-shop .shop-category-title {
                font-family: 'Playfair Display', Georgia, serif;
                font-size: 1.08rem;
                font-weight: 700;
                line-height: 1.2;
                letter-spacing: 0;
            }

            #page-shop .shop-category-description {
                max-width: 32ch;
                color: #4e4a44;
                font-size: .78rem;
                font-weight: 500;
                line-height: 1.4;
            }

            #page-shop .shop-category-action {
                display: inline-flex;
                align-items: center;
                gap: .32rem;
                margin-top: .34rem;
                color: var(--accent);
                font-size: .72rem;
                font-weight: 800;
                letter-spacing: .06em;
                text-transform: uppercase;
            }

            #page-shop .shop-category-action::after {
                content: '→';
                font-size: .9rem;
                transition: transform .22s ease;
            }

            #page-shop .shop-tab:hover .shop-category-action::after {
                transform: translateX(3px);
            }

            #page-shop.shop-show-all .shop-category {
                display: block;
            }

            #page-shop .shop-category-heading {
                display: none;
            }

            #page-shop.shop-show-all .shop-category-heading {
                display: flex;
                align-items: center;
                gap: .8rem;
                margin: 0 0 1.25rem;
                padding-bottom: .6rem;
                color: var(--black);
                font-family: 'Playfair Display', Georgia, serif;
                font-size: clamp(1.3rem, 2.4vw, 1.65rem);
                line-height: 1.2;
                border-bottom: 2px solid rgba(158, 20, 3, .22);
            }

            #page-shop.shop-show-all .shop-category-heading::after {
                content: '';
                flex: 1;
                height: 1px;
                background: linear-gradient(90deg, rgba(158, 20, 3, .26), transparent);
            }

            #page-shop.shop-show-all .shop-category + .shop-category {
                margin-top: 3rem;
                padding-top: .25rem;
            }

            @media (max-width: 700px) {
                #page-shop .storefront-header {
                    padding: 1.2rem;
                }

                #page-shop .shop-tabs {
                    grid-template-columns: 1fr;
                    gap: .72rem;
                }

                #page-shop .shop-tab {
                    min-height: 112px;
                    padding: .95rem 1rem;
                }

                #page-shop.shop-show-all .shop-category + .shop-category {
                    margin-top: 2.35rem;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #page-shop .shop-tab,
                #page-shop .shop-tab::before,
                #page-shop .shop-tab::after,
                #page-shop .shop-category-action::after {
                    transition: none;
                }

                #page-shop .shop-tab:hover {
                    transform: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function categoryTitle(tab) {
        const shopKey = tab.dataset.shop || '';
        const fallback = tab.dataset.shopCategoryTitle
            || tab.textContent.trim()
            || shopKey.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
        return SHOP_CATEGORY_COPY[shopKey]?.title || fallback;
    }

    function categoryDescription(shopKey) {
        return SHOP_CATEGORY_COPY[shopKey]?.description || 'Browse products currently available in this category.';
    }

    function firstCategoryProductImage(shopPage, shopKey) {
        const category = shopKey === 'all'
            ? shopPage.querySelector('.shop-category')
            : document.getElementById(`shop-${shopKey}`);
        if (!category) return '';

        const firstCard = category.querySelector('.product-card');
        const firstCardImage = firstCard?.querySelector('img.product-img');
        const fallbackImage = category.querySelector('.product-card img.product-img');
        const image = firstCardImage || fallbackImage;
        return image?.currentSrc || image?.src || image?.getAttribute('src') || '';
    }

    function refreshShopCategoryCards() {
        const shopPage = document.getElementById('page-shop');
        const tabs = shopPage?.querySelector('.shop-tabs');
        if (!shopPage || !tabs) return;

        tabs.querySelectorAll('.shop-tab[data-shop]').forEach(tab => {
            const shopKey = tab.dataset.shop;
            const title = categoryTitle(tab);
            const description = categoryDescription(shopKey);

            tab.dataset.shopCategoryTitle = title;
            tab.setAttribute('aria-label', `${title}: ${description}`);

            if (tab.dataset.shopCategoryCard !== 'true') {
                tab.dataset.shopCategoryCard = 'true';
                tab.innerHTML = `
                    <span class="shop-category-title"></span>
                    <span class="shop-category-description"></span>
                    <span class="shop-category-action">Browse</span>
                `;
            }

            const titleElement = tab.querySelector('.shop-category-title');
            const descriptionElement = tab.querySelector('.shop-category-description');
            if (titleElement && titleElement.textContent !== title) titleElement.textContent = title;
            if (descriptionElement && descriptionElement.textContent !== description) descriptionElement.textContent = description;

            const imageUrl = firstCategoryProductImage(shopPage, shopKey);
            if (imageUrl) {
                tab.style.setProperty('--shop-category-image', `url(${JSON.stringify(imageUrl)})`);
                tab.dataset.shopCategoryHasImage = 'true';
            } else {
                tab.style.removeProperty('--shop-category-image');
                delete tab.dataset.shopCategoryHasImage;
            }
        });
    }

    function installShopCategoryView() {
        const shopPage = document.getElementById('page-shop');
        const tabs = shopPage?.querySelector('.shop-tabs');
        if (!shopPage || !tabs) return;

        let allProductsTab = tabs.querySelector('.shop-tab[data-shop="all"]');
        if (!allProductsTab) {
            allProductsTab = document.createElement('button');
            allProductsTab.type = 'button';
            allProductsTab.className = 'shop-tab';
            allProductsTab.dataset.shop = 'all';
            allProductsTab.textContent = 'All Products';
            tabs.prepend(allProductsTab);
        }

        shopPage.querySelectorAll('.shop-category').forEach(category => {
            const categoryKey = category.id.replace(/^shop-/, '');
            const categoryTab = tabs.querySelector(`.shop-tab[data-shop="${categoryKey}"]`);
            const categoryName = categoryTab?.dataset.shopCategoryTitle
                || categoryTab?.textContent.trim()
                || categoryKey.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

            let heading = category.querySelector(':scope > .shop-category-heading');
            if (!heading) {
                heading = document.createElement('h3');
                heading.className = 'shop-category-heading';
                category.prepend(heading);
            }
            heading.textContent = categoryName;
        });

        function showShopCategory(shopKey) {
            const showAll = !shopKey || shopKey === 'all';
            shopPage.classList.toggle('shop-show-all', showAll);

            tabs.querySelectorAll('.shop-tab').forEach(tab => {
                const isActive = tab.dataset.shop === (showAll ? 'all' : shopKey);
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });

            shopPage.querySelectorAll('.shop-category').forEach(category => {
                const isActive = !showAll && category.id === `shop-${shopKey}`;
                category.classList.toggle('active', isActive);
            });
        }

        window.setShopCategory = showShopCategory;

        if (tabs.dataset.shopCategoryToggleInstalled !== 'true') {
            tabs.dataset.shopCategoryToggleInstalled = 'true';
            tabs.addEventListener('click', event => {
                const tab = event.target.closest('.shop-tab[data-shop]');
                if (!tab || !tabs.contains(tab)) return;

                const shopKey = tab.dataset.shop;
                if (shopKey === 'all') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    showShopCategory('all');
                    return;
                }

                if (tab.classList.contains('active')) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    showShopCategory('all');
                }
            }, true);
        }

        showShopCategory('all');
        refreshShopCategoryCards();
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
                refreshShopCategoryCards();
            });
        });
        observer.observe(shopPage, { childList: true, subtree: true, characterData: true });
    }

    async function initializeStorefrontGate() {
        installShopPolishStyles();
        installShopCategoryView();
        professionalizeShopPage();
        refreshShopCategoryCards();
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
        refreshShopCategoryCards();

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
