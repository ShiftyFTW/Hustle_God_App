import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_TYPES = [
  "sneaker", "clothing", "electronics", "tool", "watch", "jewelry",
  "collectible", "toy", "home_good", "appliance", "auto_part",
  "motorcycle_part", "book_media", "sporting_good", "general_unknown",
];

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

    // Check if item already has a manually set item_type (not general_unknown)
    const { data: existingItem } = await supabase
      .from("sneaker_items")
      .select("item_type")
      .eq("id", itemId)
      .maybeSingle();

    // Check for manual override: if item_type was set manually (via body param), use it
    let manualOverride: string | null = null;
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.json().catch(() => ({}));
        if (body.item_type && VALID_TYPES.includes(body.item_type)) {
          manualOverride = body.item_type;
        }
      } catch { /* no body */ }
    }

    if (manualOverride) {
      await supabase.from("sneaker_items").update({ item_type: manualOverride }).eq("id", itemId);
      await supabase.from("ai_identification").upsert(
        { item_id: itemId, item_type: manualOverride, category_confidence: 100, confidence_score: 0, missing_info: [], verified: false },
        { onConflict: "item_id" }
      );
      return new Response(
        JSON.stringify({ item_type: manualOverride, category_confidence: 100, manual: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: images } = await supabase
      .from("sneaker_images")
      .select("public_url, label, sort_order")
      .eq("item_id", itemId)
      .order("sort_order");

    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images found. Upload photos first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use up to 4 images for fast category detection
    const imageContent = images.slice(0, 4).map((img: { public_url: string }) => ({
      type: "image_url" as const,
      image_url: { url: img.public_url, detail: "low" as const },
    }));

    const systemPrompt = `You are a resale item classifier. Look at the provided photos and classify the item into exactly one category.

Valid categories:
- sneaker: athletic shoes, sneakers, basketball shoes, boots, dress shoes, any footwear
- clothing: shirts, pants, jackets, hoodies, dresses, accessories worn on the body
- electronics: phones, laptops, tablets, cameras, headphones, speakers, gaming consoles, TVs, circuit boards
- tool: power tools, hand tools, drills, saws, impact drivers, socket sets, any work/utility tool
- watch: wristwatches, pocket watches (NOT fitness bands unless clearly a watch face)
- jewelry: rings, necklaces, bracelets, earrings, pendants, chains
- collectible: trading cards, action figures, comics, coins, stamps, signed memorabilia, limited edition items
- toy: children's toys, board games, puzzles, LEGO, dolls, remote control vehicles
- home_good: furniture, decor, kitchenware, candles, bedding, rugs, lamps, mirrors, art
- appliance: kitchen appliances, vacuum cleaners, coffee makers, blenders, washing machines, small appliances
- auto_part: car parts, car accessories, steering wheels, seats, headlights, bumpers
- motorcycle_part: motorcycle fairings, exhausts, handlebars, mirrors, helmets
- book_media: books, DVDs, Blu-rays, vinyl records, CDs, video games (physical media)
- sporting_good: sports equipment, gym equipment, golf clubs, fishing gear, bikes, skateboards (not shoes)
- general_unknown: cannot determine category from photos

Return ONLY valid JSON:
{
  "item_type": "one of the valid categories above",
  "category_confidence": 0-100,
  "brief_description": "one sentence describing what you see"
}

Be decisive. Only use general_unknown if the image is truly unidentifiable.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "What category is this item? Return only the JSON." },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const itemType = VALID_TYPES.includes(parsed.item_type) ? parsed.item_type : "general_unknown";
    const confidence = typeof parsed.category_confidence === "number" ? parsed.category_confidence : 50;

    // Update sneaker_items with detected type
    await supabase.from("sneaker_items").update({ item_type: itemType }).eq("id", itemId);

    // Upsert ai_identification with category info
    await supabase.from("ai_identification").upsert(
      {
        item_id: itemId,
        item_type: itemType,
        category_confidence: confidence,
        confidence_score: 0,
        missing_info: [],
        verified: false,
      },
      { onConflict: "item_id" }
    );

    return new Response(
      JSON.stringify({
        item_type: itemType,
        category_confidence: confidence,
        brief_description: parsed.brief_description || "",
        low_confidence: confidence < 70,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[detect-category] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
