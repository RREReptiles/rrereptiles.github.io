import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const STRIPE_VERSION = "2025-03-31.basil";
export const allowedOrigins = new Set([
  "https://rrereptiles.com",
  "https://www.rrereptiles.com",
  "https://rrereptiles.github.io",
  "https://rrereptiles-github-io.pages.dev",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

export function env(name) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function cors(req) {
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

export function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function number(value, label) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} is required`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

export function positiveNumber(value, label) {
  const parsed = number(value, label);
  if (parsed <= 0) throw new Error(`${label} must be greater than zero`);
  return parsed;
}

export function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function rpc(name, payload) {
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

export async function stripeRequest(path, params = new URLSearchParams(), options = {}) {
  const method = options.method ?? "POST";
  const headers = {
    Authorization: `Bearer ${stripeKey()}`,
    "Stripe-Version": STRIPE_VERSION,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(data?.error?.message ?? `Stripe request failed (${response.status})`));
  }
  return data;
}

export async function releaseOrder(orderId, reason) {
  try {
    await rpc("release_store_order_by_id", {
      p_order_id: orderId,
      p_status: "failed",
      p_reason: reason,
    });
  } catch (error) {
    console.error("[create-stripe-checkout] release failed", error);
  }
}

export async function expireSession(sessionId) {
  try {
    await stripeRequest(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      new URLSearchParams(),
    );
  } catch (error) {
    console.error("[create-stripe-checkout] session expiry failed", error);
  }
}

export async function deleteCustomer(customerId) {
  if (!customerId?.startsWith("cus_")) return;
  try {
    await stripeRequest(
      `/v1/customers/${encodeURIComponent(customerId)}`,
      new URLSearchParams(),
      { method: "DELETE" },
    );
  } catch (error) {
    console.error("[create-stripe-checkout] temporary customer cleanup failed", error);
  }
}

export function normalizeCart(cart) {
  if (!Array.isArray(cart) || cart.length === 0 || cart.length > 30) {
    throw new Error("Cart must contain between 1 and 30 items");
  }
  const normalized = cart.map((entry) => ({
    item_id: Number(entry?.itemId ?? entry?.item_id),
    quantity: Number(entry?.quantity),
  }));
  if (normalized.some((entry) =>
    !Number.isInteger(entry.item_id) || entry.item_id <= 0 ||
    !Number.isInteger(entry.quantity) || entry.quantity <= 0 || entry.quantity > 100
  )) {
    throw new Error("Cart contains an invalid item or quantity");
  }
  return normalized;
}

export function normalizeShippingDetails(raw) {
  if (!raw || typeof raw !== "object") return null;
  const address = raw.address && typeof raw.address === "object" ? raw.address : {};
  const value = {
    name: String(raw.name ?? "").trim().replace(/\s+/g, " ").slice(0, 255),
    email: String(raw.email ?? "").trim().toLowerCase().slice(0, 320),
    phone: String(raw.phone ?? "").trim().slice(0, 40),
    address: {
      line1: String(address.line1 ?? address.line_1 ?? "").trim().replace(/\s+/g, " ").slice(0, 255),
      line2: String(address.line2 ?? address.line_2 ?? "").trim().replace(/\s+/g, " ").slice(0, 255),
      city: String(address.city ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
      state: String(address.state ?? "").trim().toUpperCase().slice(0, 2),
      postal_code: String(address.postal_code ?? address.postalCode ?? "").trim(),
      country: String(address.country ?? address.countryCode ?? "US").trim().toUpperCase(),
    },
  };
  const zip = value.address.postal_code.match(/^\d{5}/)?.[0] ?? "";
  value.address.postal_code = zip;
  if (!value.name) throw new Error("Enter the recipient name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new Error("Enter a valid email address");
  if (!value.address.line1) throw new Error("Enter the street address");
  if (!value.address.city) throw new Error("Enter the city");
  if (!/^[A-Z]{2}$/.test(value.address.state)) throw new Error("Select a valid state");
  if (!/^\d{5}$/.test(zip)) throw new Error("Enter a valid five-digit ZIP code");
  if (value.address.country !== "US") throw new Error("Only United States shipping is currently supported");
  return value;
}
