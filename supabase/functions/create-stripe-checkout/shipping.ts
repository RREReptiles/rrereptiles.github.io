import { env, money, number, positiveNumber, rpc } from "./shared.ts";

let uspsCache = null;

function sortedDimensions(a, b, c) {
  return [a, b, c].sort((x, y) => y - x);
}

function boxes(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("No active shipping boxes are configured");
  return raw.map((entry) => {
    const [l, w, h] = sortedDimensions(
      positiveNumber(entry.lengthIn, "Box length"),
      positiveNumber(entry.widthIn, "Box width"),
      positiveNumber(entry.heightIn, "Box height"),
    );
    return {
      key: String(entry.boxKey),
      name: String(entry.name),
      l, w, h,
      tareOz: Math.max(0, number(entry.emptyWeightOz, "Box weight")),
      maxLb: positiveNumber(entry.maxWeightLb, "Box max weight"),
      usable: positiveNumber(entry.usableVolumeFraction, "Box usable volume"),
    };
  }).sort((a, b) => (a.l * a.w * a.h) - (b.l * b.w * b.h));
}

function units(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("The order has no shippable items");
  const result = [];
  for (const item of raw) {
    const quantity = number(item.quantity, "Quantity");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error(`${String(item.productName)} has an invalid quantity`);
    }
    const [l, w, h] = sortedDimensions(
      positiveNumber(item.unitLengthIn, "Item length"),
      positiveNumber(item.unitWidthIn, "Item width"),
      positiveNumber(item.unitHeightIn, "Item height"),
    );
    const weightOz = positiveNumber(item.unitWeightOz, "Item weight");
    const factor = positiveNumber(item.packingFactor, "Packing factor");
    if (factor < 1 || factor > 3) {
      throw new Error(`${String(item.productName)} has an invalid packing allowance`);
    }
    for (let index = 0; index < quantity; index += 1) {
      result.push({
        itemId: Number(item.itemId),
        name: String(item.productName),
        weightOz, l, w, h,
        volume: l * w * h * factor,
        separate: Boolean(item.shipsSeparately),
        preferred: item.preferredBoxKey ? String(item.preferredBoxKey) : null,
      });
    }
  }
  if (result.length > 200) throw new Error("This order contains too many units for automatic packing");
  return result.sort((a, b) => b.volume - a.volume);
}

function fits(box, contents) {
  if (!contents.length) return false;
  const volume = contents.reduce((sum, unit) => sum + unit.volume, 0);
  const weightLb = (contents.reduce((sum, unit) => sum + unit.weightOz, 0) + box.tareOz) / 16;
  return volume <= box.l * box.w * box.h * box.usable &&
    weightLb <= box.maxLb &&
    contents.every((unit) => unit.l <= box.l && unit.w <= box.w && unit.h <= box.h);
}

function chooseBox(all, contents, preferred = null) {
  if (preferred) {
    const selected = all.find((box) => box.key === preferred);
    if (!selected) throw new Error(`Preferred box ${preferred} is not active`);
    if (!fits(selected, contents)) throw new Error(`${selected.name} cannot fit ${contents[0].name}`);
    return selected;
  }
  const selected = all.find((box) => fits(box, contents));
  if (!selected) throw new Error(`No configured shipping box can fit ${contents[0]?.name ?? "this order"}`);
  return selected;
}

function parcel(box, contents) {
  const ounces = contents.reduce((sum, unit) => sum + unit.weightOz, 0) + box.tareOz;
  return {
    boxKey: box.key,
    boxName: box.name,
    lengthIn: box.l,
    widthIn: box.w,
    heightIn: box.h,
    weightLb: Math.max(0.1, Math.ceil((ounces / 16) * 100) / 100),
    itemCount: contents.length,
    itemIds: contents.map((unit) => unit.itemId),
  };
}

function pack(rawItems, rawBoxes) {
  const allBoxes = boxes(rawBoxes);
  const allUnits = units(rawItems);
  const result = [];
  const regular = [];
  for (const unit of allUnits) {
    if (unit.separate) result.push(parcel(chooseBox(allBoxes, [unit], unit.preferred), [unit]));
    else regular.push(unit);
  }
  if (regular.length) {
    const largest = allBoxes[allBoxes.length - 1];
    let pending = [...regular];
    while (pending.length) {
      const current = [];
      const remaining = [];
      for (const unit of pending) {
        if (fits(largest, [...current, unit])) current.push(unit);
        else remaining.push(unit);
      }
      if (!current.length) throw new Error(`No configured shipping box can fit ${pending[0].name}`);
      result.push(parcel(chooseBox(allBoxes, current), current));
      pending = remaining;
    }
  }
  if (!result.length) throw new Error("No shipping packages could be created");
  if (result.length > 12) throw new Error("This order requires too many packages for automatic checkout");
  return result;
}

function validateShippingCoverage(shippingItems, checkoutItems) {
  const expected = new Map();
  for (const item of checkoutItems ?? []) {
    const itemId = Number(item.itemId);
    expected.set(itemId, {
      name: String(item.name ?? `Item ${itemId}`),
      quantity: (expected.get(itemId)?.quantity ?? 0) + Number(item.quantity),
    });
  }
  const actual = new Map();
  for (const item of shippingItems ?? []) {
    const itemId = Number(item.itemId);
    actual.set(itemId, (actual.get(itemId) ?? 0) + Number(item.quantity ?? 0));
  }
  const missing = [];
  for (const [itemId, details] of expected.entries()) {
    if (actual.get(itemId) !== details.quantity) missing.push(details.name);
  }
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} ${missing.length === 1 ? "needs" : "need"} complete USPS shipping measurements in ReptiTrax before checkout can continue.`,
    );
  }
}

function uspsBase() {
  const mode = (Deno.env.get("USPS_ENVIRONMENT") ?? "testing").toLowerCase();
  return mode === "production" || mode === "live" ? "https://apis.usps.com" : "https://apis-tem.usps.com";
}

async function uspsToken(force = false) {
  const baseUrl = uspsBase();
  if (!force && uspsCache && uspsCache.baseUrl === baseUrl && uspsCache.expiresAt > Date.now() + 60000) {
    return { token: uspsCache.token, baseUrl };
  }
  const response = await fetch(`${baseUrl}/oauth2/v3/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("USPS_CLIENT_ID"),
      client_secret: env("USPS_CLIENT_SECRET"),
      grant_type: "client_credentials",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data?.error_description ?? data?.error ?? data?.message ?? `USPS authentication failed (${response.status})`);
  }
  uspsCache = {
    token: String(data.access_token),
    baseUrl,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in ?? 28800)) * 1000,
  };
  return { token: uspsCache.token, baseUrl };
}

async function uspsRate(parcelData, zip, retry = true) {
  const { token, baseUrl } = await uspsToken();
  const origin = env("USPS_ORIGIN_ZIP").match(/^\d{5}/)?.[0];
  if (!origin) throw new Error("USPS_ORIGIN_ZIP must begin with five digits");
  const request = {
    originZIPCode: origin,
    destinationZIPCode: zip,
    weight: parcelData.weightLb,
    length: parcelData.lengthIn,
    width: parcelData.widthIn,
    height: parcelData.heightIn,
    mailClass: "USPS_GROUND_ADVANTAGE",
    processingCategory: "MACHINABLE",
    rateIndicator: "SP",
    destinationEntryFacilityType: "NONE",
    priceType: "RETAIL",
    mailingDate: new Date().toISOString().slice(0, 10),
    hasNonstandardCharacteristics: parcelData.lengthIn > 22,
  };
  const response = await fetch(`${baseUrl}/prices/v3/base-rates/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status === 401 && retry) {
    await uspsToken(true);
    return uspsRate(parcelData, zip, false);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message ?? data?.message ?? data?.error_description ?? JSON.stringify(data);
    throw new Error(`USPS rate request failed (${response.status}): ${detail}`);
  }
  const rates = Array.isArray(data.rates) ? data.rates : [];
  const first = rates.find((rate) => Number.isFinite(Number(rate.price))) ?? rates[0];
  const price = Number.isFinite(Number(data.totalBasePrice)) && Number(data.totalBasePrice) > 0
    ? Number(data.totalBasePrice)
    : Number(first?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("USPS did not return a valid package price");
  return {
    carrier: "USPS",
    service: "USPS Ground Advantage",
    description: String(first?.description ?? "USPS Ground Advantage"),
    price: money(price),
    zone: first?.zone ? String(first.zone) : null,
    parcel: parcelData,
    uspsEnvironment: (Deno.env.get("USPS_ENVIRONMENT") ?? "testing").toLowerCase(),
  };
}

export async function quoteShipping(orderId, checkoutToken, shipping, checkoutItems) {
  await rpc("increment_store_shipping_quote_attempt", {
    p_order_id: orderId,
    p_checkout_token: checkoutToken,
  });
  const input = await rpc("get_store_order_shipping_inputs", {
    p_order_id: orderId,
    p_checkout_token: checkoutToken,
  });
  if (!input) throw new Error("Shipping inputs could not be prepared");
  validateShippingCoverage(input.items, checkoutItems);
  const parcels = pack(input.items, input.boxes);
  const rates = [];
  for (const parcelData of parcels) rates.push(await uspsRate(parcelData, shipping.address.postal_code));
  const postage = money(rates.reduce((sum, rate) => sum + number(rate.price, "USPS rate"), 0));
  const handlingCents = Math.max(0, parseInt(Deno.env.get("USPS_HANDLING_CENTS") ?? "0", 10) || 0);
  const shippingTotal = money(postage + handlingCents / 100);
  const snapshot = {
    destinationZip: shipping.address.postal_code,
    destinationCountry: "US",
    carrier: "USPS",
    service: "USPS Ground Advantage",
    postageTotal: postage,
    handlingTotal: handlingCents / 100,
    shippingTotal,
    packages: rates,
    quotedAt: new Date().toISOString(),
  };
  await rpc("apply_store_shipping_quote_precheckout", {
    p_order_id: orderId,
    p_checkout_token: checkoutToken,
    p_customer_name: shipping.name,
    p_customer_email: shipping.email,
    p_customer_phone: shipping.phone,
    p_shipping_address: { name: shipping.name, address: shipping.address },
    p_destination_zip: shipping.address.postal_code,
    p_destination_country: "US",
    p_shipping_total: shippingTotal,
    p_shipping_service: "USPS Ground Advantage",
    p_quote: snapshot,
    p_package_count: parcels.length,
  });
  return {
    shippingTotal,
    shippingService: "USPS Ground Advantage",
    packageCount: parcels.length,
    quote: snapshot,
  };
}
