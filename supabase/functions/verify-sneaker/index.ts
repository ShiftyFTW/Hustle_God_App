import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

    const { data: identification, error: idErr } = await supabase
      .from("ai_identification")
      .select("*")
      .eq("item_id", itemId)
      .maybeSingle();

    if (idErr) {
      console.error("[idErr] database error:", idErr);
      return new Response(JSON.stringify({ error: "Could not save the result. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!identification) {
      return new Response(
        JSON.stringify({ error: "No identification data found. Run identification first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const itemType = identification.item_type || "general_unknown";
    const { brand, model, product_name, model_number, nickname, style_code, size, color, gender } = identification;

    const systemPrompt = `You are a resale item verification expert. Given the identified item details, cross-reference with your training knowledge to confirm or correct the identification.

Return ONLY valid JSON:
{
  "verified": boolean,
  "confidence": "high|medium|low",
  "corrections": {
    "brand": "corrected value or null if unchanged",
    "model": "corrected value or null if unchanged",
    "product_name": "corrected value or null if unchanged",
    "nickname": "corrected value or null if unchanged",
    "style_code": "corrected value or null if unchanged",
    "model_number": "corrected value or null if unchanged"
  },
  "confirmed_details": {
    "release_year": "string or null",
    "retail_price": number or null,
    "colorway_description": "string or null",
    "typical_use": "string or null"
  },
  "verification_notes": "brief explanation of what was confirmed or corrected",
  "sources": ["knowledge sources that confirm this, e.g. 'Nike SNKRS catalog', 'manufacturer database', 'eBay sold listings'"]
}

Rules:
- Set verified=true only if you are confident the brand/model combination is a real product
- Only correct fields if you are certain — do not guess
- Set corrections fields to null if no correction needed`;

    const userMessage = `Verify this ${itemType.replace(/_/g, " ")} identification:
Brand: ${brand || "Unknown"}
Product Name: ${product_name || "Unknown"}
Model: ${model || "Unknown"}
Model Number: ${model_number || "Not identified"}
Colorway/Nickname: ${nickname || "Unknown"}
Style Code: ${style_code || "Not identified"}
Size: ${size || "Unknown"}
Color: ${color || "Unknown"}
Gender/Category: ${gender || "Unknown"}

Is this a real product? Are there corrections needed? Return only JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const corrections = parsed.corrections || {};
    const correctedFields: Record<string, string | null> = {};
    if (corrections.brand)        correctedFields.brand = corrections.brand;
    if (corrections.model)        correctedFields.model = corrections.model;
    if (corrections.product_name) correctedFields.product_name = corrections.product_name;
    if (corrections.nickname)     correctedFields.nickname = corrections.nickname;
    if (corrections.style_code)   correctedFields.style_code = corrections.style_code;
    if (corrections.model_number) correctedFields.model_number = corrections.model_number;

    await supabase.from("ai_identification").update({
      verified: !!parsed.verified,
      verification_sources: parsed.sources || [],
      ...correctedFields,
    }).eq("item_id", itemId);

    if (Object.keys(correctedFields).length > 0) {
      await supabase.from("sneaker_items").update(correctedFields).eq("id", itemId);
    }

    return new Response(
      JSON.stringify({
        verified: !!parsed.verified,
        confidence: parsed.confidence,
        corrections: correctedFields,
        confirmed_details: parsed.confirmed_details || {},
        verification_notes: parsed.verification_notes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[verify-sneaker] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
