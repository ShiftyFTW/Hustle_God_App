import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PRICE = 1_000_000;

/** A listing price must be a finite, positive, sanely bounded number. */
function validPrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return null;
  return Math.round(n * 100) / 100;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const itemId = params.id;

  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ error: 'A valid item reference is required.' }, { status: 400 });
  }

  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const ebayToken = process.env.EBAY_OAUTH_TOKEN;
  if (!ebayToken) {
    return NextResponse.json(
      { error: 'eBay OAuth token not configured. Add EBAY_OAUTH_TOKEN to your environment secrets.' },
      { status: 503 }
    );
  }

  const { data: item } = await supabase
    .from('sneaker_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  const { data: listing } = await supabase
    .from('listing_content')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle();

  const { data: images } = await supabase
    .from('sneaker_images')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order')
    .limit(12);

  if (!item || !listing) {
    return NextResponse.json({ error: 'Item or listing content not found' }, { status: 404 });
  }

  // Publishing spends real money on the owner's eBay account, so the gating
  // state is re-checked here rather than trusted from whichever screen called.
  if (item.status === 'listed' || item.status === 'sold') {
    return NextResponse.json(
      { error: 'This item has already been published.' },
      { status: 409 }
    );
  }

  // The price is never taken from the request body: it comes only from the
  // server-side value that comp research produced.
  const price = validPrice(item.list_price);
  if (price === null) {
    return NextResponse.json(
      { error: 'Set a valid list price for this item before publishing.' },
      { status: 400 }
    );
  }

  const floor = validPrice(item.do_not_sell_below);
  if (floor !== null && price < floor) {
    return NextResponse.json(
      { error: 'The list price is below the do-not-sell-below floor for this item.' },
      { status: 400 }
    );
  }

  const baseUrl = 'https://api.ebay.com';
  const headers = {
    Authorization: `Bearer ${ebayToken}`,
    'Content-Type': 'application/json',
    'Content-Language': 'en-US',
  };

  // 1. Create or update inventory item
  const sku = `RESALE-${item.item_id}`;
  const inventoryPayload = {
    availability: {
      shipToLocationAvailability: {
        quantity: 1,
      },
    },
    condition: mapCondition(item.condition_grade),
    conditionDescription: String(body.conditionDescription || '').slice(0, 1000),
    product: {
      title: listing.ebay_title,
      description: listing.ebay_description,
      imageUrls: (images || []).map((i: { public_url: string }) => i.public_url).slice(0, 12),
      aspects: listing.item_specifics || {},
    },
  };

  const invRes = await fetch(`${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(inventoryPayload),
  });

  if (!invRes.ok && invRes.status !== 204) {
    console.error('eBay inventory error:', invRes.status, await invRes.text());
    return NextResponse.json(
      { error: 'Could not create the eBay inventory item. Please try again.' },
      { status: 502 }
    );
  }

  // 2. Create offer
  const offerPayload = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: body.categoryId || '15709',
    listingDescription: listing.ebay_description,
    listingPolicies: {
      fulfillmentPolicyId: body.fulfillmentPolicyId,
      paymentPolicyId: body.paymentPolicyId,
      returnPolicyId: body.returnPolicyId,
    },
    pricingSummary: {
      price: {
        currency: 'USD',
        value: price.toFixed(2),
      },
    },
    merchantLocationKey: body.merchantLocationKey,
  };

  const offerRes = await fetch(`${baseUrl}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers,
    body: JSON.stringify(offerPayload),
  });

  if (!offerRes.ok) {
    console.error('eBay offer error:', offerRes.status, await offerRes.text());
    return NextResponse.json(
      { error: 'Could not create the eBay offer. Please try again.' },
      { status: 502 }
    );
  }

  const offerData = await offerRes.json();
  const offerId = offerData.offerId;

  // 3. Publish offer
  const pubRes = await fetch(`${baseUrl}/sell/inventory/v1/offer/${offerId}/publish`, {
    method: 'POST',
    headers,
  });

  if (!pubRes.ok) {
    console.error('eBay publish error:', pubRes.status, await pubRes.text());
    return NextResponse.json(
      { error: 'Could not publish the eBay listing. Please try again.' },
      { status: 502 }
    );
  }

  const pubData = await pubRes.json();
  const listingId = pubData.listingId;
  const listingUrl = `https://www.ebay.com/itm/${listingId}`;

  // 4. Save to DB
  await supabase
    .from('sneaker_items')
    .update({
      status: 'listed',
      ebay_listing_id: listingId,
      ebay_listing_url: listingUrl,
    })
    .eq('id', itemId);

  await supabase
    .from('platform_listings')
    .upsert({
      item_id: itemId,
      platform: 'ebay',
      status: 'listed',
      listing_url: listingUrl,
      ebay_listing_id: listingId,
      ebay_offer_id: offerId,
      listed_at: new Date().toISOString(),
    }, { onConflict: 'item_id, platform' });

  return NextResponse.json({
    success: true,
    listingId,
    listingUrl,
    offerId,
  });
}

function mapCondition(grade: string | null): string {
  switch (grade) {
    case 'new_with_box':
    case 'new_without_box':
      return 'NEW';
    case 'pre_owned_excellent':
      return 'LIKE_NEW';
    case 'pre_owned_good':
      return 'GOOD';
    case 'pre_owned_fair':
      return 'ACCEPTABLE';
    case 'damaged_flawed':
      return 'FOR_PARTS_OR_NOT_WORKING';
    default:
      return 'USED_EXCELLENT';
  }
}
