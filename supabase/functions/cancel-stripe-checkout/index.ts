import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const STRIPE_VERSION = "2025-03-31.basil";
const allowedOrigins = new Set([
  "https://rrereptiles.com",
  "https://www.rrereptiles.com",
  "https://rrereptiles.github.io",
  "https://rrereptiles-github-io.pages.dev",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function env(name) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function cors(req) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
      ? origin
      : "https://rrereptiles.com",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function stripeKey() {
  const key = env("STRIPE_SECRET_KEY");
  const mode = (Deno.env.get("STRIPE_ENVIRONMENT") ?? "test").toLowerCase();
  if (mode === "test" && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("Stripe test mode requires a test secret key");
  }
  if ((mode === "live" || mode === "production") &&
      !key.startsWith("sk_live_") && !key.startsWith("rk_live_")) {
    throw new Error("Stripe live mode requires a live secret key");
  }
  return key;
}

async function stripeRequest(path, options = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Stripe-Version": STRIPE_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : "",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? `Stripe request failed (${response.status})`;
    if (options.ignoreNotOpen && response.status === 400 && String(message).toLowerCase().includes("not open")) {
      return data;
    }
    throw new Error(String(message));
  }
  return data;
}

async function rpc(name, payload) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? `Database request failed (${response.status})`);
  }
  return data;
}

async function deleteTemporaryCustomer(session) {
  const metadata = session?.metadata ?? {};
  const customerId = typeof session?.customer === "string"
    ? session.customer
    : String(session?.customer?.id ?? "");
  if (String(metadata.temporary_customer) !== "true" || !customerId.startsWith("cus_")) return false;
  try {
    await stripeRequest(`/v1/customers/${encodeURIComponent(customerId)}`, { method: "DELETE" });
    return true;
  } catch (error) {
    console.error("[cancel-stripe-checkout] temporary customer cleanup failed", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: "Origin not allowed" }, 403);

  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? body.session_id ?? "").trim();
    if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
      return json(req, { error: "A valid Stripe Checkout Session ID is required" }, 400);
    }

    const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (String(session.status) === "open") {
      await stripeRequest(
        `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
        { method: "POST", ignoreNotOpen: true },
      );
    }
    const customerDeleted = await deleteTemporaryCustomer(session);
    await rpc("release_store_order_by_stripe", {
      p_stripe_checkout_session_id: sessionId,
      p_status: "cancelled",
      p_reason: "Buyer cancelled Stripe checkout",
    });
    return json(req, { ok: true, customerDeleted });
  } catch (error) {
    console.error("[cancel-stripe-checkout]", error);
    return json(req, {
      error: error instanceof Error ? error.message : "Checkout could not be cancelled",
    }, 400);
  }
});
