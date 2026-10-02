import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CATEGORY_PROMPTS: Record<string, string> = {
  sneaker: `You are an expert sneaker authenticator with deep knowledge of every major brand, model, colorway, and style code.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "model": "string or null",
  "product_name": "full product name e.g. Nike Air Force 1 Low or null",
  "nickname": "colorway name or null",
  "style_code": "exact SKU/style code or null — NEVER invent this",
  "upc": "UPC if visible or null",
  "size": "shoe size as string or null",
  "gender": "mens|womens|gs|ps|td|unisex or null",
  "category": "lifestyle|basketball|running|training|skate|etc or null",
  "color": "primary color description or null",
  "materials": "upper materials or null",
  "production_dates": "release year or date range or null",
  "box_details": {"present": boolean, "condition": "string or null", "label_readable": boolean},
  "authenticity_notes": "any authentication flags or null",
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}

RULES: Never invent style codes. Never claim deadstock unless clearly unworn.`,

  clothing: `You are an expert clothing appraiser who identifies brands, styles, and condition from photos.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "product_name": "full item name e.g. Vintage Levi 501 Jeans or null",
  "model": "style name or null",
  "size": "clothing size or null",
  "gender": "mens|womens|unisex|kids or null",
  "color": "primary color(s) or null",
  "materials": "fabric composition if visible or null",
  "measurements": "key measurements if visible (chest, waist, inseam, etc.) or null",
  "category": "tops|bottoms|outerwear|footwear|accessories|etc or null",
  "production_dates": "approximate era or year if determinable or null",
  "authenticity_notes": "vintage markers, tags, wash labels, counterfeit flags or null",
  "included_accessories": "tags still attached, extra buttons, etc. or null",
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  electronics: `You are an electronics expert who identifies devices from photos including model numbers, serial plates, and packaging.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "product_name": "full product name or null",
  "model": "model name or null",
  "model_number": "exact model number if visible or null",
  "serial_number": "serial number if visible or null",
  "color": "color/finish or null",
  "storage_capacity": "storage size if applicable or null",
  "testing_status": "powers on|does not power on|untested|not applicable or null",
  "included_accessories": "charger, cables, case, original box, etc. or null",
  "missing_accessories": "what is missing or null",
  "visible_flaws": ["list of visible damage, scratches, cracks"],
  "authenticity_notes": "any counterfeit indicators or null",
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  tool: `You are a professional tool appraiser who identifies power tools, hand tools, and equipment from photos.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "product_name": "full tool name or null",
  "model": "model name or null",
  "model_number": "exact model number if visible or null",
  "serial_number": "serial if visible or null",
  "color": "brand color or null",
  "measurements": "voltage, size, or key specs if visible or null",
  "testing_status": "tested working|untested|not working or null",
  "included_accessories": "batteries, charger, case, bits, blades, etc. or null",
  "missing_accessories": "what is missing or null",
  "visible_flaws": ["list of visible damage or wear"],
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  watch: `You are a horology expert who identifies watches from photos including brand, reference number, and authenticity markers.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "product_name": "full watch name e.g. Rolex Datejust 41 or null",
  "model": "collection/line name or null",
  "model_number": "reference number if visible or null",
  "serial_number": "serial number if visible or null",
  "color": "dial color and case color or null",
  "materials": "case material, bracelet material or null",
  "measurements": "case diameter if determinable or null",
  "production_dates": "estimated year or era or null",
  "authenticity_notes": "authentication markers, red flags, or confirmation or null",
  "included_accessories": "box, papers, extra links, tags, etc. or null",
  "missing_accessories": "what is missing or null",
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  jewelry: `You are a jewelry expert who identifies pieces from photos including metal type, stones, and hallmarks.

Return ONLY valid JSON:
{
  "brand": "brand or designer if visible or null",
  "product_name": "description e.g. 14k Yellow Gold Diamond Tennis Bracelet or null",
  "model": "style name or null",
  "color": "metal color and stone colors or null",
  "materials": "metal type, stone type if determinable or null",
  "measurements": "length, weight, stone size if visible or null",
  "authenticity_notes": "hallmarks, stamps, appraisal tags, or authentication notes or null",
  "included_accessories": "box, certificate, appraisal docs or null",
  "visible_flaws": ["damage, missing stones, clasps, etc."],
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  collectible: `You are a collectibles expert with knowledge of trading cards, figures, coins, memorabilia, and limited editions.

Return ONLY valid JSON:
{
  "brand": "manufacturer, publisher, or issuer or null",
  "product_name": "full item name or null",
  "model": "series or set name or null",
  "model_number": "card number, issue number, catalog number or null",
  "serial_number": "serial/edition number if visible or null",
  "production_dates": "year or era or null",
  "authenticity_notes": "authentication markers, cert numbers, grading info or null",
  "included_accessories": "case, cert, COA, original packaging or null",
  "visible_flaws": ["damage, creases, fading, etc."],
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,

  general_unknown: `You are a professional resale appraiser. Identify what this item is and extract all visible information.

Return ONLY valid JSON:
{
  "brand": "string or null",
  "product_name": "best description of what this item is or null",
  "model": "model name or null",
  "model_number": "model/part number if visible or null",
  "serial_number": "serial if visible or null",
  "color": "primary color(s) or null",
  "materials": "material composition if determinable or null",
  "measurements": "size or dimensions if determinable or null",
  "included_accessories": "what is included or null",
  "missing_accessories": "what appears to be missing or null",
  "visible_flaws": ["list of visible damage or wear"],
  "authenticity_notes": "any relevant notes or null",
  "confidence_score": 0-100,
  "missing_info": ["fields that would improve accuracy"]
}`,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const itemId = parts[parts.length - 1];

    if (!itemId || !UUID_RE.test(itemId)) {
      return new Response(JSON.stringify({ error: "A valid item reference is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY secret is not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const openai = new OpenAI({ apiKey: openaiKey });

    const [imagesRes, existingIdRes, itemRes] = await Promise.all([
      supabase.from("sneaker_images").select("*").eq("item_id", itemId).order("sort_order"),
      supabase.from("ai_identification").select("item_type, category_confidence").eq("item_id", itemId).maybeSingle(),
      supabase.from("sneaker_items").select("item_type").eq("id", itemId).maybeSingle(),
    ]);

    const images = imagesRes.data;
    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images found. Upload photos first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine item_type from prior detect-category step
    const itemType: string = existingIdRes.data?.item_type || itemRes.data?.item_type || "general_unknown";

    const imageContent = images.slice(0, 6).map((img: { public_url: string }) => ({
      type: "image_url" as const,
      image_url: { url: img.public_url, detail: "high" as const },
    }));

    // Pick category-specific prompt; fall back to general
    const systemPrompt =
      CATEGORY_PROMPTS[itemType] ||
      CATEGORY_PROMPTS["general_unknown"];

    const categoryLabel = itemType.replace(/_/g, " ");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify this ${categoryLabel} from the photos. Extract every visible detail. Return only the JSON.`,
            },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const confidence = typeof parsed.confidence_score === "number" ? parsed.confidence_score : 0;
    const missingInfo = Array.isArray(parsed.missing_info) ? parsed.missing_info : [];

    const upsertPayload: Record<string, unknown> = {
      item_id: itemId,
      item_type: itemType,
      category_confidence: existingIdRes.data?.category_confidence || 0,
      brand: parsed.brand || null,
      model: parsed.model || null,
      product_name: parsed.product_name || null,
      model_number: parsed.model_number || null,
      serial_number: parsed.serial_number || null,
      nickname: parsed.nickname || null,
      style_code: parsed.style_code || null,
      upc: parsed.upc || null,
      size: parsed.size || null,
      color: parsed.color || null,
      measurements: parsed.measurements || null,
      gender: parsed.gender || null,
      category: parsed.category || null,
      production_dates: parsed.production_dates || null,
      materials: parsed.materials || null,
      included_accessories: parsed.included_accessories || null,
      missing_accessories: parsed.missing_accessories || null,
      visible_flaws: Array.isArray(parsed.visible_flaws) ? parsed.visible_flaws : [],
      testing_status: parsed.testing_status || null,
      authenticity_notes: parsed.authenticity_notes || null,
      box_details: parsed.box_details || null,
      confidence_score: confidence,
      missing_info: missingInfo,
      raw_response: parsed,
      verified: false,
    };

    const { data: idData, error: idErr } = await supabase
      .from("ai_identification")
      .upsert(upsertPayload, { onConflict: "item_id" })
      .select()
      .single();

    if (idErr) {
      console.error("[idErr] database error:", idErr);
      return new Response(JSON.stringify({ error: "Could not save the result. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sync core fields back to sneaker_items
    const itemUpdate: Record<string, unknown> = {
      brand: parsed.brand || null,
      model: parsed.model || null,
      product_name: parsed.product_name || null,
      model_number: parsed.model_number || null,
      serial_number: parsed.serial_number || null,
      nickname: parsed.nickname || null,
      style_code: parsed.style_code || null,
      upc: parsed.upc || null,
      size: parsed.size || null,
      color: parsed.color || null,
      measurements: parsed.measurements || null,
      gender: parsed.gender || null,
      category: parsed.category || null,
    };

    const newStatus = confidence < 90 || missingInfo.length > 0 ? "needs_review" : "ready_to_list";
    itemUpdate.status = newStatus;

    await supabase.from("sneaker_items").update(itemUpdate).eq("id", itemId);

    return new Response(
      JSON.stringify({ identification: idData, item_type: itemType, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[identify-sneaker] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
