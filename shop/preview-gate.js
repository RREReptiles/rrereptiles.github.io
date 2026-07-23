(() => {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const previewEnabled = params.get('storefront-preview') === '1';

    if (!previewEnabled) return;

    document.body.classList.add('storefront-preview-enabled');

    const shopPage = document.getElementById('page-shop');
    const onlineCategory = document.getElementById('shop-online-store');
    const onlineTab = document.querySelector('.storefront-tab');
    if (!shopPage || !onlineCategory || !onlineTab) return;

    const notice = document.createElement('div');
    notice.className = 'storefront-preview-notice';
    notice.textContent = 'Sandbox preview: Stripe uses test cards and does not create a real charge.';
    onlineCategory.prepend(notice);

    const shopLink = document.querySelector('.nav-links [data-page="shop"]')
        || document.querySelector('[data-page="shop"]');
    shopLink?.click();
    onlineTab.click();
})();
