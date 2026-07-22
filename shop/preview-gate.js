(() => {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const previewEnabled = params.get('storefront-preview') === '1';

    if (!previewEnabled) return;

    document.body.classList.add('storefront-preview-enabled');

    const shopPage = document.getElementById('page-shop');
    const onlineCategory = document.getElementById('shop-online-store');
    if (!shopPage || !onlineCategory) return;

    const notice = document.createElement('div');
    notice.className = 'storefront-preview-notice';
    notice.textContent = 'Sandbox preview: PayPal uses test accounts and does not create a real charge.';
    onlineCategory.prepend(notice);
})();
