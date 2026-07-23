(() => {
    'use strict';

    function updateLegacyPaymentCopy() {
        const shopPage = document.getElementById('page-shop');
        const shopNotice = shopPage?.querySelector('.shop-notice');
        if (shopNotice) {
            shopNotice.innerHTML = '<strong>How to Purchase:</strong> Dry goods marked for online checkout can be purchased securely by card or eligible digital wallet through Stripe. Live-animal sales and special-order items are still handled by direct inquiry or MorphMarket.';
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
                answer.innerHTML = '<p>Contact us at 970-400-1278, email <a href="mailto:rrereptiles@gmail.com">rrereptiles@gmail.com</a>, or reach out through our social media or MorphMarket. Online Stripe checkout is available only for products specifically marked for checkout.</p>';
            }
        });
    }

    updateLegacyPaymentCopy();

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
