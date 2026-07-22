from pathlib import Path

STOREFRONT_PATH = Path("shop/storefront.js")

OLD = """                    const name = completed.payerName ? `, ${completed.payerName}` : '';
                    setCheckoutStatus(`Payment complete${name}. Your order has been recorded.`, 'success');
"""

NEW = """                    const name = completed.payerName ? `, ${completed.payerName}` : '';
                    setCheckoutStatus(`Payment complete${name}. Redirecting to order ${completed.orderNumber || ''}…`, 'success');
                    if (completed.confirmationUrl) {
                        window.location.assign(completed.confirmationUrl);
                        return;
                    }
"""


def main() -> None:
    source = STOREFRONT_PATH.read_text(encoding="utf-8")
    if NEW in source:
        print("Confirmation redirect already present")
        return
    if OLD not in source:
        raise RuntimeError("Could not locate the completed-payment block in storefront.js")

    STOREFRONT_PATH.write_text(source.replace(OLD, NEW, 1), encoding="utf-8")
    print("Added order confirmation redirect")


if __name__ == "__main__":
    main()
