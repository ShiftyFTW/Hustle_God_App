import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';
import OpenAI from 'openai';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const itemId = params.id;

  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ error: 'A valid item reference is required.' }, { status: 400 });
  }

  const supabase = createUserClient(req);
  if (!supabase) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const [itemRes, identRes, condRes, compRes] = await Promise.all([
    supabase.from('sneaker_items').select('*').eq('id', itemId).maybeSingle(),
    supabase.from('ai_identification').select('*').eq('item_id', itemId).maybeSingle(),
    supabase.from('condition_assessment').select('*').eq('item_id', itemId).maybeSingle(),
    supabase.from('comp_research').select('*').eq('item_id', itemId).maybeSingle(),
  ]);

  const item = itemRes.data;
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 503 });
  }

  const openai = new OpenAI({ apiKey });

  const brand = item.brand || identRes.data?.brand || '';
  const model = item.model || identRes.data?.model || '';
  const nickname = item.nickname || identRes.data?.nickname || '';
  const styleCode = item.style_code || identRes.data?.style_code || '';
  const size = item.size || identRes.data?.size || '';
  const gender = item.gender || identRes.data?.gender || '';
  const condition = item.condition_grade || condRes.data?.grade || '';
  const conditionNotes = condRes.data?.detailed_notes || '';
  const price = item.list_price || compRes.data?.recommended_price || 0;
  const materials = identRes.data?.materials || '';

  const systemPrompt = `You are a professional sneaker resale listing copywriter. Create optimized, SEO-rich listings for all major platforms.

RULES:
- eBay title: EXACTLY under 80 characters, include brand/model/size/condition/style code
- All titles: keyword-rich, no ALL CAPS, no spammy punctuation
- Descriptions: honest, buyer-friendly, highlight condition accurately
- Never claim authenticity without evidence; never claim deadstock unless confirmed new
- Item specifics: use exact values eBay expects

Return ONLY valid JSON:
{
  "ebay_title": "string (max 80 chars)",
  "facebook_title": "string",
  "mercari_title": "string",
  "offerup_title": "string",
  "ebay_description": "string (HTML ok, detailed)",
  "facebook_description": "string",
  "mercari_description": "string",
  "offerup_description": "string",
  "item_specifics": {
    "Brand": "string",
    "Model": "string",
    "Style Code": "string",
    "US Shoe Size (Men's)": "string or N/A",
    "US Shoe Size (Women's)": "string or N/A",
    "Width": "Medium (D, M)",
    "Color": "string",
    "Material": "string",
    "Condition": "string",
    "Department": "string",
    "Type": "Athletic",
    "Upper Material": "string"
  },
  "keyword_bank": ["array", "of", "relevant", "keywords"],
  "hashtags": ["#hashtag", "#list"],
  "photo_feedback": ["suggested photo additions or improvements"],
  "platform_strategy": "string paragraph with recommended platform priority and pricing strategy"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write listings for:
Brand: ${brand}
Model: ${model}
Colorway/Nickname: ${nickname}
Style Code: ${styleCode}
Size: ${size}
Gender: ${gender}
Condition Grade: ${condition}
Condition Notes: ${conditionNotes}
Materials: ${materials}
List Price: $${price}

Generate complete, production-ready listings for all 4 platforms. Return only JSON.`,
      },
    ],
    max_tokens: 2500,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  const { data: listingData, error: listErr } = await supabase
    .from('listing_content')
    .upsert({
      item_id: itemId,
      ebay_title: parsed.ebay_title || null,
      facebook_title: parsed.facebook_title || null,
      mercari_title: parsed.mercari_title || null,
      offerup_title: parsed.offerup_title || null,
      ebay_description: parsed.ebay_description || null,
      facebook_description: parsed.facebook_description || null,
      mercari_description: parsed.mercari_description || null,
      offerup_description: parsed.offerup_description || null,
      item_specifics: parsed.item_specifics || {},
      keyword_bank: Array.isArray(parsed.keyword_bank) ? parsed.keyword_bank : [],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      photo_feedback: Array.isArray(parsed.photo_feedback) ? parsed.photo_feedback : [],
      platform_strategy: parsed.platform_strategy || null,
      raw_response: parsed,
    }, { onConflict: 'item_id' })
    .select()
    .single();

  if (listErr) {
    console.error('listing content upsert failed:', listErr);
    return NextResponse.json({ error: 'Could not save the listing content. Please try again.' }, { status: 500 });
  }

  // Mark item as ready to list if not already
  const { data: currentItem } = await supabase
    .from('sneaker_items')
    .select('status')
    .eq('id', itemId)
    .maybeSingle();

  if (currentItem && !['listed', 'sold'].includes(currentItem.status)) {
    await supabase
      .from('sneaker_items')
      .update({ status: 'ready_to_list' })
      .eq('id', itemId);
  }

  return NextResponse.json({ listing: listingData });
}
