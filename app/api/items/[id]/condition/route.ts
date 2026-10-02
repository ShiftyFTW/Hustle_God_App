import { NextRequest, NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase-server';
import OpenAI from 'openai';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_GRADES = [
  'new_with_box',
  'new_without_box',
  'pre_owned_excellent',
  'pre_owned_good',
  'pre_owned_fair',
  'damaged_flawed',
];

/** Only store a grade the app actually understands. */
function safeGrade(value: unknown): string | null {
  return typeof value === 'string' && VALID_GRADES.includes(value) ? value : null;
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

  const { data: images } = await supabase
    .from('sneaker_images')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order');

  if (!images || images.length === 0) {
    return NextResponse.json({ error: 'No images found. Upload photos first.' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 503 });
  }

  const openai = new OpenAI({ apiKey });

  // Prioritize outsole, flaw, and detail shots for condition
  const prioritized = [
    ...images.filter((i) => ['outsole', 'flaw', 'side', 'back', 'hero'].includes(i.label)),
    ...images.filter((i) => !['outsole', 'flaw', 'side', 'back', 'hero'].includes(i.label)),
  ].slice(0, 6);

  const imageContent = prioritized.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: img.public_url, detail: 'high' as const },
  }));

  const systemPrompt = `You are a professional sneaker grader. Analyze photos and provide a detailed condition assessment.

Return ONLY valid JSON:
{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "outsole_wear": "none|light|moderate|heavy|string description",
  "heel_drag": "none|light|moderate|heavy",
  "toe_box_creasing": "none|light|moderate|heavy",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "yellowing": "none|minor|moderate|significant",
  "missing_insoles": boolean,
  "lace_condition": "original|replaced|dirty|missing",
  "box_condition": "excellent|good|fair|damaged|not_present",
  "sole_separation": boolean,
  "odor_risk": boolean,
  "detailed_notes": "honest paragraph about condition for buyer transparency",
  "photo_feedback": ["list of photos that are missing or would improve assessment"]
}

Grade definitions:
- new_with_box: unworn, original box present and intact
- new_without_box: unworn or VNDS, no box
- pre_owned_excellent: minimal wear, looks near new
- pre_owned_good: normal wear, no major flaws
- pre_owned_fair: visible wear, may have flaws
- damaged_flawed: significant damage, repairs needed

IMPORTANT: Be honest and conservative. Never upgrade grade beyond what photos support.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Assess the condition of these sneakers. Return only the JSON.' },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  const { data: assessData, error: assErr } = await supabase
    .from('condition_assessment')
    .upsert({
      item_id: itemId,
      grade: safeGrade(parsed.grade),
      outsole_wear: parsed.outsole_wear || null,
      heel_drag: parsed.heel_drag || null,
      toe_box_creasing: parsed.toe_box_creasing || null,
      scuffs: parsed.scuffs || null,
      stains: parsed.stains || null,
      yellowing: parsed.yellowing || null,
      missing_insoles: !!parsed.missing_insoles,
      lace_condition: parsed.lace_condition || null,
      box_condition: parsed.box_condition || null,
      sole_separation: !!parsed.sole_separation,
      odor_risk: !!parsed.odor_risk,
      detailed_notes: parsed.detailed_notes || null,
      photo_feedback: Array.isArray(parsed.photo_feedback) ? parsed.photo_feedback : [],
      raw_response: parsed,
    }, { onConflict: 'item_id' })
    .select()
    .single();

  if (assErr) {
    console.error('condition upsert failed:', assErr);
    return NextResponse.json({ error: 'Could not save the condition assessment. Please try again.' }, { status: 500 });
  }

  // Update item condition
  const validatedGrade = safeGrade(parsed.grade);
  if (validatedGrade) {
    await supabase
      .from('sneaker_items')
      .update({ condition_grade: validatedGrade })
      .eq('id', itemId);
  }

  return NextResponse.json({ assessment: assessData });
}
