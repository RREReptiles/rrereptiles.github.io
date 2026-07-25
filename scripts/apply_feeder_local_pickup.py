from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


js_path = Path("shop/storefront.js")
js = js_path.read_text(encoding="utf-8")
js = replace_once(
    js,
    """    function productPrice(product) {\n        const display = String(product.display_price_text || '').trim();\n        if (display) return display.replace(/\\.00(?=\\s|$)/, '');\n        return currency.format(Number(product.price || 0));\n    }\n\n    function totalCartQuantity() {""",
    """    function productPrice(product) {\n        const display = String(product.display_price_text || '').trim();\n        if (display) return display.replace(/\\.00(?=\\s|$)/, '');\n        return currency.format(Number(product.price || 0));\n    }\n\n    function isLocalPickupOnly(product) {\n        return product?.local_pickup_only === true || product?.store_category === 'feeders';\n    }\n\n    function purchaseMode(product) {\n        return isLocalPickupOnly(product) ? 'inquiry' : product?.purchase_mode;\n    }\n\n    function totalCartQuantity() {""",
    "local pickup purchase-mode helper",
)
js = replace_once(
    js,
    """            if (!product || !product.in_stock || product.purchase_mode !== 'checkout') return [];""",
    """            if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return [];""",
    "remove pickup-only products from cart",
)
js = replace_once(
    js,
    """    function normalizeCartAgainstCatalog() {\n        state.cart = state.cart.flatMap(item => {\n            const product = state.products.get(item.itemId);\n            if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return [];\n            const available = Math.max(0, Number(product.available_quantity || 0));\n            const configuredMax = product.max_per_order == null\n                ? available\n                : Math.min(available, Number(product.max_per_order));\n            const quantity = Math.min(item.quantity, configuredMax);\n            return quantity > 0 ? [{ itemId: item.itemId, quantity }] : [];\n        });\n        saveCart();\n    }\n\n    function buildStorefrontShell() {""",
    """    function normalizeCartAgainstCatalog() {\n        state.cart = state.cart.flatMap(item => {\n            const product = state.products.get(item.itemId);\n            if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return [];\n            const available = Math.max(0, Number(product.available_quantity || 0));\n            const configuredMax = product.max_per_order == null\n                ? available\n                : Math.min(available, Number(product.max_per_order));\n            const quantity = Math.min(item.quantity, configuredMax);\n            return quantity > 0 ? [{ itemId: item.itemId, quantity }] : [];\n        });\n        saveCart();\n    }\n\n    function ensureFeederPickupNotice() {\n        const panel = document.getElementById('shop-feeders');\n        if (!panel) return;\n\n        let notice = panel.querySelector(':scope > .shop-notice');\n        if (!notice) {\n            notice = document.createElement('div');\n            notice.className = 'shop-notice';\n            panel.prepend(notice);\n        }\n        notice.classList.add('storefront-local-pickup-notice');\n        notice.innerHTML = '<strong>Local Pickup Only:</strong> Live insects, feeder cultures, and other feeder items are available for local pickup in Colorado only. We do not ship live feeders. Use the Inquire button to confirm current availability, quantities, pricing, and pickup arrangements.';\n    }\n\n    function buildStorefrontShell() {""",
    "feeder section pickup notice",
)
js = replace_once(
    js,
    """        info.querySelectorAll('.inquire, [data-storefront-action], [data-storefront-stock-label]').forEach(element => element.remove());\n\n        const stock = document.createElement('p');""",
    """        info.querySelectorAll('.inquire, [data-storefront-action], [data-storefront-stock-label], [data-storefront-local-pickup]').forEach(element => element.remove());\n\n        if (product && isLocalPickupOnly(product)) {\n            const badge = document.createElement('span');\n            badge.className = 'storefront-local-pickup-badge';\n            badge.dataset.storefrontLocalPickup = '';\n            badge.textContent = 'Local Pickup Only';\n            info.appendChild(badge);\n        }\n\n        const stock = document.createElement('p');""",
    "local pickup product badge",
)
js = replace_once(
    js,
    """        if (product?.in_stock && product.purchase_mode === 'checkout') {""",
    """        if (product?.in_stock && purchaseMode(product) === 'checkout') {""",
    "checkout action guard",
)
js = replace_once(
    js,
    """        if (product?.in_stock && product.purchase_mode === 'inquiry') {""",
    """        if (product?.in_stock && purchaseMode(product) === 'inquiry') {""",
    "inquiry action guard",
)
js = replace_once(
    js,
    """        if (!product || !product.in_stock || product.purchase_mode !== 'checkout') return;""",
    """        if (!product || !product.in_stock || purchaseMode(product) !== 'checkout') return;""",
    "add-to-cart pickup guard",
)
js = replace_once(
    js,
    """    function init() {\n        updateWebsitePrivacyPolicy();\n        const shell = buildStorefrontShell();""",
    """    function init() {\n        updateWebsitePrivacyPolicy();\n        ensureFeederPickupNotice();\n        const shell = buildStorefrontShell();""",
    "initialize feeder pickup notice",
)
js_path.write_text(js, encoding="utf-8")

css_path = Path("shop/storefront.css")
css = css_path.read_text(encoding="utf-8")
marker = ".storefront-local-pickup-badge"
if marker in css:
    raise RuntimeError("local pickup storefront styles already exist")
css += """\n\n.storefront-local-pickup-notice {\n    border-left-color: var(--accent);\n}\n\n.storefront-local-pickup-badge {\n    display: inline-flex;\n    align-items: center;\n    width: fit-content;\n    margin: .15rem 0 .45rem;\n    padding: .28rem .62rem;\n    border: 1px solid rgba(158, 20, 3, .2);\n    border-radius: 999px;\n    background: rgba(158, 20, 3, .08);\n    color: var(--accent);\n    font-size: .68rem;\n    font-weight: 800;\n    letter-spacing: .03em;\n    text-transform: uppercase;\n}\n"""
css_path.write_text(css, encoding="utf-8")
