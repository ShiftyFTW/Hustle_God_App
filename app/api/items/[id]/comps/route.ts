import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';
import OpenAI from 'openai';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PRICE = 1_000_000;

/**
 * The model's numbers are untrusted input: the prompt below is built from
 * item fields that are writable through the data API, so a planted
 * instruction could steer the model into returning an absurd or negative
 * price. Only a finite, positive, bounded number is ever stored.
 */
function safePrice(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return null;
  return Math.round(n * 100) / 100;
}

function safeDays(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 3650) return null;
  return Math.round(n);
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

  const { data: item } = await supabase
    .from('sneaker_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const { data: identification } = await supabase
    .from('ai_identification')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 503 });
  }

  const openai = new OpenAI({ apiKey });

  const brand = item.brand || identification?.brand || 'Unknown Brand';
  const model = item.model || identification?.model || 'Unknown Model';
  const styleCode = item.style_code || identification?.style_code || '';
  const nickname = item.nickname || identification?.nickname || '';
  const size = item.size || identification?.size || '';
  const gender = item.gender || identification?.gender || '';
  const condition = item.condition_grade || '';

  const searchQuery = [brand, model, nickname, styleCode].filter(Boolean).join(' ');

  const systemPrompt = `You are an expert sneaker resale pricing analyst. Based on the provided sneaker details, simulate comprehensive comp research from eBay, GOAT, StockX, and other resale platforms.

IMPORTANT RULES:
- Separate SOLD/completed prices from ACTIVE asking prices
- Be conservative on pricing — protect profit
- Base recommended price on SOLD comps, NOT asking prices
- Never guess — if uncertain, provide a range

Return ONLY valid JSON:
{
  "active_listings": [
    {"title": "string", "price": number, "platform": "string", "condition": "string", "url": null}
  ],
  "sold_listings": [
    {"title": "string", "price": number, "platform": "string", "condition": "string", "date": "string"}
  ],
  "fast_sale_price": number,
  "recommended_price": number,
  "accept_offer_floor": number,
  "local_cash_price": number,
  "do_not_sell_below": number,
  "expected_sell_days": number,
  "pricing_notes": "string",
  "market_summary": "string"
}

Price tiers:
- fast_sale_price: price that would sell in under 24h (usually 10-15% below market)
- recommended_price: optimal balance of speed and profit (based on sold comps)
- accept_offer_floor: minimum you'd accept from a best-offer buyer
- local_cash_price: for Facebook/OfferUp local sales (usually 80-85% of recommended)
- do_not_sell_below: absolute floor accounting for fees (eBay ~13%, Mercari ~12.9%)`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Research comps for:
Brand: ${brand}
Model: ${model}
Colorway/Nickname: ${nickname}
Style Code: ${styleCode}
Size: ${size}
Gender: ${gender}
Condition: ${condition}
Search query: ${searchQuery}

Provide realistic comp data based on your training knowledge of the sneaker market. Return only JSON.`,
      },
    ],
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  const prices = {
    fast_sale_price: safePrice(parsed.fast_sale_price),
    recommended_price: safePrice(parsed.recommended_price),
    accept_offer_floor: safePrice(parsed.accept_offer_floor),
    local_cash_price: safePrice(parsed.local_cash_price),
    do_not_sell_below: safePrice(parsed.do_not_sell_below),
  };

  const { data: compData, error: compErr } = await supabase
    .from('comp_research')
    .upsert({
      item_id: itemId,
      active_listings: Array.isArray(parsed.active_listings) ? parsed.active_listings : [],
      sold_listings: Array.isArray(parsed.sold_listings) ? parsed.sold_listings : [],
      ...prices,
      expected_sell_days: safeDays(parsed.expected_sell_days),
      sources: [
        { platform: 'eBay', query: searchQuery },
        { platform: 'GOAT', query: searchQuery },
        { platform: 'StockX', query: searchQuery },
      ],
      raw_response: parsed,
    }, { onConflict: 'item_id' })
    .select()
    .single();

  if (compErr) {
    console.error('comps upsert failed:', compErr);
    return NextResponse.json({ error: 'Could not save the pricing research. Please try again.' }, { status: 500 });
  }

  // Update item with recommended price
  if (prices.recommended_price !== null) {
    await supabase
      .from('sneaker_items')
      .update({
        list_price: prices.recommended_price,
        accept_offer_floor: prices.accept_offer_floor,
        do_not_sell_below: prices.do_not_sell_below,
        local_cash_price: prices.local_cash_price,
      })
      .eq('id', itemId);
  }

  return NextResponse.json({ comps: compData, notes: parsed.pricing_notes, summary: parsed.market_summary });
}
