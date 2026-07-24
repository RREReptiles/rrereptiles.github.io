create or replace function public.get_store_order_shipping_inputs(
  p_order_id uuid,
  p_checkout_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'orderId', orders.id,
    'checkoutToken', orders.checkout_token,
    'status', orders.status,
    'currency', orders.currency,
    'subtotal', orders.subtotal,
    'shippingQuoteAttempts', orders.shipping_quote_attempts,
    'reservationExpiresAt', orders.reservation_expires_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId', order_items.item_id,
        'productName', order_items.product_name,
        'quantity', order_items.quantity,
        'shippingProfile', products.shipping_profile,
        'stripeTaxCode', products.stripe_tax_code,
        'unitWeightOz', profiles.unit_weight_oz,
        'unitLengthIn', profiles.unit_length_in,
        'unitWidthIn', profiles.unit_width_in,
        'unitHeightIn', profiles.unit_height_in,
        'packingFactor', profiles.packing_factor,
        'shipsSeparately', profiles.ships_separately,
        'preferredBoxKey', profiles.preferred_box_key
      ) order by order_items.id)
      from public.store_order_items order_items
      join public.store_products products
        on products.item_id = order_items.item_id
      join public.store_shipping_profiles profiles
        on profiles.profile_key = products.shipping_profile
       and profiles.active = true
      where order_items.order_id = orders.id
    ), '[]'::jsonb),
    'boxes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'boxKey', boxes.box_key,
        'name', boxes.name,
        'lengthIn', boxes.length_in,
        'widthIn', boxes.width_in,
        'heightIn', boxes.height_in,
        'emptyWeightOz', boxes.empty_weight_oz,
        'maxWeightLb', boxes.max_weight_lb,
        'usableVolumeFraction', boxes.usable_volume_fraction
      ) order by boxes.sort_order, boxes.length_in * boxes.width_in * boxes.height_in)
      from public.store_shipping_boxes boxes
      where boxes.active = true
    ), '[]'::jsonb)
  )
  from public.store_orders orders
  where orders.id = p_order_id
    and orders.checkout_token = p_checkout_token
    and orders.status = 'created'
    and orders.inventory_reserved = true
    and orders.shipping_quote_attempts < 20
  limit 1;
$function$;

create or replace function public.increment_store_shipping_quote_attempt(
  p_order_id uuid,
  p_checkout_token uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
begin
  update public.store_orders orders
  set shipping_quote_attempts = orders.shipping_quote_attempts + 1,
      updated_at = now()
  where orders.id = p_order_id
    and orders.checkout_token = p_checkout_token
    and orders.status = 'created'
    and orders.inventory_reserved = true
    and orders.shipping_quote_attempts < 20
  returning orders.shipping_quote_attempts into v_attempts;

  if not found then
    raise exception 'Store order cannot receive another shipping quote';
  end if;

  return v_attempts;
end;
$function$;

create or replace function public.apply_store_shipping_quote_precheckout(
  p_order_id uuid,
  p_checkout_token uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb,
  p_destination_zip text,
  p_destination_country text,
  p_shipping_total numeric,
  p_shipping_service text,
  p_quote jsonb,
  p_package_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.store_orders%rowtype;
begin
  if p_destination_country <> 'US' then
    raise exception 'Only United States shipping is currently supported';
  end if;
  if p_destination_zip !~ '^\d{5}$' then
    raise exception 'A valid five-digit destination ZIP code is required';
  end if;
  if p_shipping_total is null or p_shipping_total < 0 then
    raise exception 'Shipping total is invalid';
  end if;
  if coalesce(trim(p_shipping_service), '') = '' then
    raise exception 'Shipping service is required';
  end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception 'Shipping quote details are required';
  end if;
  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'Shipping address details are required';
  end if;
  if p_package_count is null or p_package_count < 1 then
    raise exception 'At least one shipping package is required';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'Customer name is required';
  end if;
  if coalesce(trim(p_customer_email), '') = '' then
    raise exception 'Customer email is required';
  end if;

  update public.store_orders orders
  set customer_name = left(trim(p_customer_name), 255),
      customer_email = left(trim(p_customer_email), 320),
      customer_phone = nullif(left(trim(coalesce(p_customer_phone, '')), 40), ''),
      shipping_address = p_shipping_address,
      shipping_total = round(p_shipping_total, 2),
      tax_total = 0,
      total = round(orders.subtotal + round(p_shipping_total, 2), 2),
      shipping_carrier = 'USPS',
      shipping_service = p_shipping_service,
      shipping_rate_source = 'USPS Domestic Prices API',
      shipping_destination_zip = p_destination_zip,
      shipping_destination_country = p_destination_country,
      shipping_package_count = p_package_count,
      shipping_quote = p_quote,
      shipping_quoted_at = now(),
      shipping_last_error = null,
      reservation_expires_at = greatest(
        coalesce(orders.reservation_expires_at, now()),
        now() + interval '10 minutes'
      ),
      updated_at = now()
  where orders.id = p_order_id
    and orders.checkout_token = p_checkout_token
    and orders.status = 'created'
    and orders.inventory_reserved = true
  returning orders.* into v_order;

  if not found then
    raise exception 'Store order could not accept the shipping quote';
  end if;

  return jsonb_build_object(
    'orderId', v_order.id,
    'checkoutToken', v_order.checkout_token,
    'subtotal', v_order.subtotal,
    'shippingTotal', v_order.shipping_total,
    'taxTotal', v_order.tax_total,
    'total', v_order.total,
    'currency', v_order.currency,
    'shippingService', v_order.shipping_service,
    'shippingDestinationZip', v_order.shipping_destination_zip,
    'shippingQuotedAt', v_order.shipping_quoted_at
  );
end;
$function$;

create or replace function public.record_store_checkout_preview_totals(
  p_order_id uuid,
  p_checkout_token uuid,
  p_amount_subtotal_cents bigint,
  p_amount_shipping_cents bigint,
  p_amount_tax_cents bigint,
  p_amount_total_cents bigint,
  p_stripe_tax_status text,
  p_stripe_tax_breakdown jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.store_orders%rowtype;
  v_subtotal numeric;
  v_shipping numeric;
  v_tax numeric;
  v_total numeric;
begin
  if p_amount_subtotal_cents < 0
      or p_amount_shipping_cents < 0
      or p_amount_tax_cents < 0
      or p_amount_total_cents < 0 then
    raise exception 'Stripe preview totals are invalid';
  end if;

  v_subtotal := round(p_amount_subtotal_cents::numeric / 100, 2);
  v_shipping := round(p_amount_shipping_cents::numeric / 100, 2);
  v_tax := round(p_amount_tax_cents::numeric / 100, 2);
  v_total := round(p_amount_total_cents::numeric / 100, 2);

  update public.store_orders orders
  set subtotal = v_subtotal,
      shipping_total = v_shipping,
      tax_total = v_tax,
      total = v_total,
      stripe_tax_status = nullif(trim(coalesce(p_stripe_tax_status, '')), ''),
      stripe_tax_breakdown = coalesce(p_stripe_tax_breakdown, '[]'::jsonb),
      updated_at = now()
  where orders.id = p_order_id
    and orders.checkout_token = p_checkout_token
    and orders.status = 'created'
    and orders.inventory_reserved = true
  returning orders.* into v_order;

  if not found then
    raise exception 'Store order could not record Stripe preview totals';
  end if;

  return jsonb_build_object(
    'orderId', v_order.id,
    'subtotal', v_order.subtotal,
    'shippingTotal', v_order.shipping_total,
    'taxTotal', v_order.tax_total,
    'total', v_order.total,
    'stripeTaxStatus', v_order.stripe_tax_status
  );
end;
$function$;

revoke all on function public.get_store_order_shipping_inputs(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_store_order_shipping_inputs(uuid, uuid) to service_role;

revoke all on function public.increment_store_shipping_quote_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.increment_store_shipping_quote_attempt(uuid, uuid) to service_role;

revoke all on function public.apply_store_shipping_quote_precheckout(
  uuid, uuid, text, text, text, jsonb, text, text, numeric, text, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.apply_store_shipping_quote_precheckout(
  uuid, uuid, text, text, text, jsonb, text, text, numeric, text, jsonb, integer
) to service_role;

revoke all on function public.record_store_checkout_preview_totals(
  uuid, uuid, bigint, bigint, bigint, bigint, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_store_checkout_preview_totals(
  uuid, uuid, bigint, bigint, bigint, bigint, text, jsonb
) to service_role;
