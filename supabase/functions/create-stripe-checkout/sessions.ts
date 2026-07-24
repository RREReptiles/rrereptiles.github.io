import { stripeRequest } from "./shared.ts";

function addAddress(params, prefix, shipping) {
  params.set(`${prefix}[name]`, shipping.name);
  if (shipping.phone) params.set(`${prefix}[phone]`, shipping.phone);
  params.set(`${prefix}[address][line1]`, shipping.address.line1);
  if (shipping.address.line2) params.set(`${prefix}[address][line2]`, shipping.address.line2);
  params.set(`${prefix}[address][city]`, shipping.address.city);
  params.set(`${prefix}[address][state]`, shipping.address.state);
  params.set(`${prefix}[address][postal_code]`, shipping.address.postal_code);
  params.set(`${prefix}[address][country]`, "US");
}

function addLineItems(params, items) {
  items.forEach((item, index) => {
    const cents = Math.round(Number(item.unitPrice) * 100);
    if (!Number.isInteger(cents) || cents <= 0) throw new Error(`${String(item.name)} has an invalid price`);
    params.set(`line_items[${index}][price_data][currency]`, "usd");
    params.set(`line_items[${index}][price_data][unit_amount]`, String(cents));
    params.set(`line_items[${index}][price_data][tax_behavior]`, "exclusive");
    params.set(`line_items[${index}][price_data][product_data][name]`, String(item.name).slice(0, 250));
    params.set(`line_items[${index}][price_data][product_data][tax_code]`, String(item.stripeTaxCode || "txcd_99999999"));
    params.set(`line_items[${index}][price_data][product_data][metadata][item_id]`, String(item.itemId));
    const imageUrl = String(item.imageUrl ?? "").trim();
    if (/^https:\/\//i.test(imageUrl)) params.set(`line_items[${index}][price_data][product_data][images][0]`, imageUrl);
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
}

export async function createCustomer(orderId, checkoutToken, shipping) {
  const params = new URLSearchParams();
  params.set("name", shipping.name);
  params.set("email", shipping.email);
  if (shipping.phone) params.set("phone", shipping.phone);
  params.set("address[line1]", shipping.address.line1);
  if (shipping.address.line2) params.set("address[line2]", shipping.address.line2);
  params.set("address[city]", shipping.address.city);
  params.set("address[state]", shipping.address.state);
  params.set("address[postal_code]", shipping.address.postal_code);
  params.set("address[country]", "US");
  addAddress(params, "shipping", shipping);
  params.set("metadata[local_order_id]", orderId);
  params.set("metadata[checkout_token]", checkoutToken);
  params.set("metadata[rre_checkout_temporary]", "true");
  const customer = await stripeRequest("/v1/customers", params, { idempotencyKey: `rre-customer-${orderId}` });
  const customerId = String(customer.id ?? "");
  if (!customerId.startsWith("cus_")) throw new Error("Stripe did not create the checkout customer");
  return customerId;
}

export async function createReviewSession({ origin, orderId, checkoutToken, inputs, shipping, quote, customerId, expiresAt }) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("ui_mode", "embedded");
  params.set("return_url", `${origin}/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("automatic_tax[enabled]", "true");
  params.set("customer", customerId);
  params.set("expires_at", String(expiresAt));
  params.set("client_reference_id", orderId);
  params.set("metadata[local_order_id]", orderId);
  params.set("metadata[checkout_token]", checkoutToken);
  params.set("metadata[checkout_flow]", "review_v2");
  params.set("metadata[temporary_customer]", "true");
  params.set("payment_intent_data[metadata][local_order_id]", orderId);
  params.set("payment_intent_data[metadata][checkout_token]", checkoutToken);
  params.set("payment_intent_data[receipt_email]", shipping.email);
  addAddress(params, "payment_intent_data[shipping]", shipping);
  params.set("shipping_options[0][shipping_rate_data][display_name]", quote.shippingService);
  params.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(Math.round(quote.shippingTotal * 100)));
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  params.set("shipping_options[0][shipping_rate_data][tax_behavior]", "exclusive");
  params.set("shipping_options[0][shipping_rate_data][tax_code]", "txcd_92010001");
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]", "business_day");
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]", "2");
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]", "business_day");
  params.set("shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]", "5");
  addLineItems(params, inputs.items);
  return stripeRequest("/v1/checkout/sessions", params, { idempotencyKey: `rre-session-${orderId}` });
}

export async function createLegacySession({ origin, orderId, checkoutToken, inputs, expiresAt }) {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("ui_mode", "embedded");
  params.set("return_url", `${origin}/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("automatic_tax[enabled]", "true");
  params.set("customer_creation", "always");
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("permissions[update_shipping_details]", "server_only");
  params.set("phone_number_collection[enabled]", "true");
  params.set("expires_at", String(expiresAt));
  params.set("client_reference_id", orderId);
  params.set("metadata[local_order_id]", orderId);
  params.set("metadata[checkout_token]", checkoutToken);
  params.set("metadata[checkout_flow]", "legacy_dynamic_shipping");
  params.set("payment_intent_data[metadata][local_order_id]", orderId);
  params.set("payment_intent_data[metadata][checkout_token]", checkoutToken);
  params.set("shipping_options[0][shipping_rate_data][display_name]", "USPS shipping — calculated after address");
  params.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", "0");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
  params.set("shipping_options[0][shipping_rate_data][tax_behavior]", "exclusive");
  params.set("shipping_options[0][shipping_rate_data][tax_code]", "txcd_92010001");
  addLineItems(params, inputs.items);
  return stripeRequest("/v1/checkout/sessions", params, { idempotencyKey: `rre-session-${orderId}` });
}
