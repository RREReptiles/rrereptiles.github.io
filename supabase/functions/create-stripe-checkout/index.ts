import {
  allowedOrigins,
  cors,
  deleteCustomer,
  expireSession,
  json,
  normalizeCart,
  normalizeShippingDetails,
  releaseOrder,
  rpc,
} from "./shared.ts";
import { quoteShipping } from "./shipping.ts";
import { createCustomer, createLegacySession, createReviewSession } from "./sessions.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const originHeader = req.headers.get("origin");
  if (originHeader && !allowedOrigins.has(originHeader)) return json(req, { error: "Origin not allowed" }, 403);

  let localOrderId = "";
  let stripeSessionId = "";
  let temporaryCustomerId = "";
  try {
    const body = await req.json();
    const normalizedCart = normalizeCart(body?.cart);
    const shipping = normalizeShippingDetails(body?.shippingDetails ?? body?.shipping_details);

    const createdRows = await rpc("create_store_order_record", { p_cart: normalizedCart });
    const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
    if (!created?.order_id || !created?.checkout_token) throw new Error("The local store order was not created");
    localOrderId = String(created.order_id);
    const checkoutToken = String(created.checkout_token);

    await rpc("reserve_store_order_inventory", {
      p_order_id: localOrderId,
      p_checkout_token: checkoutToken,
      p_reservation_minutes: 35,
    });
    const inputs = await rpc("get_store_order_stripe_inputs", {
      p_order_id: localOrderId,
      p_checkout_token: checkoutToken,
    });
    if (!inputs || !Array.isArray(inputs.items) || inputs.items.length === 0) {
      throw new Error("Stripe checkout items could not be prepared");
    }

    const siteOrigin = originHeader && allowedOrigins.has(originHeader)
      ? originHeader
      : "https://rrereptiles.com";
    const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
    let session;
    let quote = null;
    if (shipping) {
      quote = await quoteShipping(localOrderId, checkoutToken, shipping, inputs.items);
      temporaryCustomerId = await createCustomer(localOrderId, checkoutToken, shipping);
      session = await createReviewSession({
        origin: siteOrigin,
        orderId: localOrderId,
        checkoutToken,
        inputs,
        shipping,
        quote,
        customerId: temporaryCustomerId,
        expiresAt,
      });
    } else {
      session = await createLegacySession({
        origin: siteOrigin,
        orderId: localOrderId,
        checkoutToken,
        inputs,
        expiresAt,
      });
    }

    stripeSessionId = String(session.id ?? "");
    const clientSecret = String(session.client_secret ?? "");
    if (!stripeSessionId || !clientSecret) throw new Error("Stripe did not return an embedded Checkout Session");
    try {
      await rpc("attach_stripe_checkout_session", {
        p_order_id: localOrderId,
        p_checkout_token: checkoutToken,
        p_stripe_checkout_session_id: stripeSessionId,
        p_expires_at: new Date(Number(session.expires_at ?? expiresAt) * 1000).toISOString(),
        p_livemode: Boolean(session.livemode),
      });
    } catch (error) {
      await expireSession(stripeSessionId);
      throw error;
    }

    let preview = null;
    if (shipping) {
      const totals = session.total_details ?? {};
      const automaticTax = session.automatic_tax ?? {};
      if (automaticTax.status && automaticTax.status !== "complete") {
        throw new Error("Stripe could not calculate sales tax for this delivery address");
      }
      preview = await rpc("record_store_checkout_preview_totals", {
        p_order_id: localOrderId,
        p_checkout_token: checkoutToken,
        p_amount_subtotal_cents: Number(session.amount_subtotal ?? 0),
        p_amount_shipping_cents: Number(totals.amount_shipping ?? Math.round(quote.shippingTotal * 100)),
        p_amount_tax_cents: Number(totals.amount_tax ?? 0),
        p_amount_total_cents: Number(session.amount_total ?? 0),
        p_stripe_tax_status: String(automaticTax.status ?? ""),
        p_stripe_tax_breakdown: totals.breakdown?.taxes ?? [],
      });
    }

    return json(req, {
      clientSecret,
      sessionId: stripeSessionId,
      localOrderId,
      expiresAt: session.expires_at,
      environment: Boolean(session.livemode) ? "live" : "test",
      checkoutFlow: shipping ? "review_v2" : "legacy_dynamic_shipping",
      subtotal: preview ? Number(preview.subtotal) : Number(inputs.subtotal ?? 0),
      shippingTotal: preview ? Number(preview.shippingTotal) : null,
      taxTotal: preview ? Number(preview.taxTotal) : null,
      total: preview ? Number(preview.total) : null,
      shippingService: quote?.shippingService ?? null,
      packageCount: quote?.packageCount ?? null,
      uspsEnvironment: quote?.quote?.packages?.[0]?.uspsEnvironment ?? null,
      shippingAddress: shipping ? {
        name: shipping.name,
        line1: shipping.address.line1,
        line2: shipping.address.line2,
        city: shipping.address.city,
        state: shipping.address.state,
        postalCode: shipping.address.postal_code,
        country: "US",
      } : null,
    });
  } catch (error) {
    console.error("[create-stripe-checkout]", error);
    if (stripeSessionId) await expireSession(stripeSessionId);
    if (temporaryCustomerId) await deleteCustomer(temporaryCustomerId);
    if (localOrderId) await releaseOrder(localOrderId, "Stripe Checkout Session could not be created");
    const message = error instanceof Error ? error.message : "Checkout could not be started";
    const lower = message.toLowerCase();
    const status = lower.includes("stock") || lower.includes("available")
      ? 409
      : lower.includes("address") || lower.includes("zip") || lower.includes("state") || lower.includes("email")
        ? 422
        : 400;
    return json(req, { error: message }, status);
  }
});
