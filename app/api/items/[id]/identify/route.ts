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

  // Fetch images for this item
  const { data: images, error: imgErr } = await supabase
    .from('sneaker_images')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order');

  if (imgErr) {
    console.error('identify image fetch failed:', imgErr);
    return NextResponse.json({ error: 'Could not load the photos for this item. Please try again.' }, { status: 500 });
  }
  if (!images || images.length === 0) {
    return NextResponse.json({ error: 'No images found. Upload photos first.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your environment.' }, { status: 503 });
  }

  const openai = new OpenAI({ apiKey });

  // Build image content
  const imageContent = images.slice(0, 6).map((img) => ({
    type: 'image_url' as const,
    image_url: { url: img.public_url, detail: 'high' as const },
  }));

  const systemPrompt = `You are an expert sneaker authenticator and identifier with deep knowledge of every major sneaker brand, model, colorway, and style code. Analyze the provided sneaker photos and extract precise product information.

Return ONLY a valid JSON object with these exact fields:
{
  "brand": "string or null",
  "model": "string or null",
  "nickname": "colorway name string or null",
  "style_code": "exact style/SKU code or null",
  "upc": "UPC barcode if visible or null",
  "size": "shoe size as string or null",
  "gender": "mens|womens|gs|ps|td|unisex or null",
  "category": "lifestyle|basketball|running|training|skate|etc or null",
  "production_dates": "year or date range if visible or null",
  "materials": "primary materials description or null",
  "box_details": {"present": boolean, "condition": "string or null", "label_readable": boolean},
  "confidence_score": 0-100 integer,
  "missing_info": ["array of missing fields that would improve accuracy"]
}

Rules:
- NEVER invent style codes — only report what is visibly confirmed
- NEVER call something deadstock/new unless clearly unworn
- If you cannot determine a field, set it to null and add to missing_info
- Confidence score: 90+ means all key fields confirmed from visual evidence`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this sneaker from these photos. Return only the JSON object.' },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  const confidence = typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0;
  const missingInfo = Array.isArray(parsed.missing_info) ? parsed.missing_info : [];
  const newStatus = confidence < 90 || missingInfo.length > 0 ? 'needs_review' : 'ready_to_list';

  // Upsert identification record
  const { data: idData, error: idErr } = await supabase
    .from('ai_identification')
    .upsert({
      item_id: itemId,
      brand: parsed.brand || null,
      model: parsed.model || null,
      nickname: parsed.nickname || null,
      style_code: parsed.style_code || null,
      upc: parsed.upc || null,
      size: parsed.size || null,
      gender: parsed.gender || null,
      category: parsed.category || null,
      production_dates: parsed.production_dates || null,
      materials: parsed.materials || null,
      box_details: parsed.box_details || {},
      confidence_score: confidence,
      missing_info: missingInfo,
      raw_response: parsed,
      verified: false,
    }, { onConflict: 'item_id' })
    .select()
    .single();

  if (idErr) {
    console.error('identification upsert failed:', idErr);
    return NextResponse.json({ error: 'Could not save the identification result. Please try again.' }, { status: 500 });
  }

  // Update sneaker_items with identified fields
  await supabase
    .from('sneaker_items')
    .update({
      brand: parsed.brand || null,
      model: parsed.model || null,
      nickname: parsed.nickname || null,
      style_code: parsed.style_code || null,
      upc: parsed.upc || null,
      size: parsed.size || null,
      gender: parsed.gender || null,
      category: parsed.category || null,
      status: newStatus,
    })
    .eq('id', itemId);

  return NextResponse.json({ identification: idData, status: newStatus });
}
