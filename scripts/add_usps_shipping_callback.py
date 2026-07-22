from pathlib import Path

PATH = Path("shop/storefront.js")

OLD_SDK = "&intent=capture&components=buttons`"
NEW_SDK = "&intent=capture&components=buttons&commit=false`"

OLD_APPROVE = """            },
            async onApprove(data) {
"""

NEW_APPROVE = """            },
            async onShippingAddressChange(data, actions) {
                if (data.shippingAddress?.countryCode !== 'US') {
                    setCheckoutStatus('Online checkout currently supports United States addresses only.', 'error');
                    return actions.reject(data.errors.COUNTRY_ERROR);
                }

                setCheckoutStatus('Calculating USPS shipping for this address…');
                try {
                    const quote = await requestJson(`${FUNCTIONS_URL}/update-paypal-shipping`, {
                        method: 'POST',
                        body: JSON.stringify({
                            orderID: data.orderID,
                            shippingAddress: data.shippingAddress
                        })
                    });
                    setCheckoutStatus(
                        `${quote.service}: ${currency.format(Number(quote.shippingTotal))}. Order total: ${currency.format(Number(quote.orderTotal))}.`
                    );
                } catch (error) {
                    console.error('[storefront] shipping quote error', error);
                    setCheckoutStatus(error.message || 'Shipping could not be calculated for this address.', 'error');
                    return actions.reject(data.errors.ZIP_ERROR || data.errors.ADDRESS_ERROR);
                }
            },
            async onApprove(data) {
"""


def main() -> None:
    source = PATH.read_text(encoding="utf-8")
    changed = False

    if NEW_SDK not in source:
        if OLD_SDK not in source:
            raise RuntimeError("Could not locate the PayPal SDK URL")
        source = source.replace(OLD_SDK, NEW_SDK, 1)
        changed = True

    if "async onShippingAddressChange(data, actions)" not in source:
        if OLD_APPROVE not in source:
            raise RuntimeError("Could not locate the PayPal onApprove callback")
        source = source.replace(OLD_APPROVE, NEW_APPROVE, 1)
        changed = True

    if changed:
        PATH.write_text(source, encoding="utf-8")
        print("Added USPS dynamic shipping callback")
    else:
        print("USPS dynamic shipping callback already present")


if __name__ == "__main__":
    main()
