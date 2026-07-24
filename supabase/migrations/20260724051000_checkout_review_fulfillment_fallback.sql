create or replace function public.complete_store_order_by_stripe(
  p_stripe_checkout_session_id text,
  p_checkout_token uuid,
  p_stripe_payment_intent_id text,
  p_stripe_payment_status text,
  p_stripe_livemode boolean,
  p_amount_subtotal_cents integer,
  p_amount_shipping_cents integer,
  p_amount_tax_cents integer,
  p_amount_total_cents integer,
  p_stripe_tax_status text,
  p_stripe_tax_breakdown jsonb,
  p_payment_source text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.store_orders%rowtype;
  v_effective_shipping_address jsonb;
  v_zip text;
  v_expected_subtotal integer;
  v_expected_shipping integer;
  v_expected_total integer;
begin
  select orders.*
  into v_order
  from public.store_orders orders
  where orders.stripe_checkout_session_id = p_stripe_checkout_session_id
  for update;

  if not found then raise exception 'Store order was not found'; end if;
  if v_order.checkout_token <> p_checkout_token then
    raise exception 'Stripe checkout token does not match the store order';
  end if;
  if v_order.status = 'paid' then return v_order.id; end if;
  if not v_order.inventory_reserved then
    raise exception 'Inventory was not reserved before payment completion';
  end if;
  if p_stripe_payment_status <> 'paid' then
    raise exception 'Stripe payment has not completed';
  end if;

  if v_order.shipping_quote is null
     or v_order.shipping_destination_zip is null
     or v_order.shipping_destination_country <> 'US'
     or v_order.shipping_quoted_at is null
     or v_order.shipping_quoted_at < now() - interval '2 hours' then
    raise exception 'A current USPS shipping quote is required before payment completion';
  end if;

  v_effective_shipping_address := case
    when p_shipping_address is not null
      and jsonb_typeof(p_shipping_address) = 'object'
      and coalesce(
        p_shipping_address->'address'->>'postal_code',
        p_shipping_address->>'postal_code',
        ''
      ) <> ''
      then p_shipping_address
    else v_order.shipping_address
  end;

  v_zip := coalesce(
    v_effective_shipping_address->'address'->>'postal_code',
    v_effective_shipping_address->>'postal_code',
    ''
  );
  v_zip := substring(v_zip from '^\d{5}');
  if v_zip is null or v_zip <> v_order.shipping_destination_zip then
    raise exception 'Stripe shipping ZIP does not match the USPS quote';
  end if;

  v_expected_subtotal := round(v_order.subtotal * 100)::integer;
  v_expected_shipping := round(v_order.shipping_total * 100)::integer;
  v_expected_total := v_expected_subtotal + v_expected_shipping + p_amount_tax_cents;

  if p_amount_subtotal_cents <> v_expected_subtotal then
    raise exception 'Stripe subtotal does not match the store order';
  end if;
  if p_amount_shipping_cents <> v_expected_shipping then
    raise exception 'Stripe shipping amount does not match the USPS quote';
  end if;
  if p_amount_total_cents <> v_expected_total then
    raise exception 'Stripe total does not match the store order';
  end if;

  update public.store_orders orders
  set stripe_payment_intent_id = nullif(p_stripe_payment_intent_id, ''),
      stripe_payment_status = p_stripe_payment_status,
      stripe_livemode = p_stripe_livemode,
      stripe_tax_status = p_stripe_tax_status,
      stripe_tax_breakdown = p_stripe_tax_breakdown,
      status = 'paid',
      payment_source = coalesce(nullif(p_payment_source, ''), 'stripe'),
      customer_name = coalesce(nullif(trim(p_customer_name), ''), v_order.customer_name),
      customer_email = coalesce(nullif(trim(p_customer_email), ''), v_order.customer_email),
      customer_phone = coalesce(nullif(trim(p_customer_phone), ''), v_order.customer_phone),
      shipping_address = v_effective_shipping_address,
      tax_total = round(p_amount_tax_cents::numeric / 100, 2),
      total = round(p_amount_total_cents::numeric / 100, 2),
      inventory_reserved = false,
      reservation_expires_at = null,
      paid_at = now(),
      updated_at = now()
  where orders.id = v_order.id;

  return v_order.id;
end;
$function$;
