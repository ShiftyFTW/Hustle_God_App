import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildCompsPrompt(itemType: string): string {
  const platformsByType: Record<string, string> = {
    sneaker: "eBay, GOAT, StockX, Poshmark, Mercari",
    clothing: "eBay, Poshmark, Mercari, Depop, ThredUp",
    electronics: "eBay, Swappa, BackMarket, Facebook Marketplace, Craigslist",
    tool: "eBay, Craigslist, Facebook Marketplace, OfferUp",
    watch: "eBay, Chrono24, WatchBox, Bob's Watches",
    jewelry: "eBay, Poshmark, Etsy, local pawn shops",
    collectible: "eBay, PWCC, MySlabs, TCGPlayer, Heritage Auctions",
    toy: "eBay, Mercari, Facebook Marketplace",
    home_good: "eBay, Facebook Marketplace, OfferUp, Craigslist",
    appliance: "eBay, Facebook Marketplace, Craigslist, OfferUp",
    auto_part: "eBay Motors, RockAuto, Facebook Marketplace, Craigslist",
    motorcycle_part: "eBay Motors, CycleGear, Facebook Marketplace",
    book_media: "eBay, Amazon, Decluttr, Facebook Marketplace",
    sporting_good: "eBay, Poshmark, Facebook Marketplace, OfferUp",
  };

  const platforms = platformsByType[itemType] || "eBay, Facebook Marketplace, Mercari, OfferUp";

  return `You are a professional resale pricing analyst specializing in ${itemType.replace(/_/g, " ")} items. Research current market values.

IMPORTANT RULES:
- Separate SOLD/completed prices from ACTIVE asking prices
- Base recommended price on SOLD comps, NOT asking prices
- Be conservative — protect profit margin after fees
- If sold comps are weak or sparse, say so explicitly in pricing_notes
- If the item is not worth listing online, say so and recommend alternatives (local sale, bundle, donate, scrap)
- Account for platform fees: eBay ~13%, Mercari ~12.9%, Poshmark ~20%, Etsy ~6.5%
- ALWAYS provide a price estimate even for obscure or niche items. Use your knowledge of similar items, brand positioning, retail prices, and category norms to estimate. A rough estimate is better than no estimate. Only return null for prices if you truly cannot estimate at all.
- Even if not_worth_listing is true, still provide a recommended_price and local_cash_price so the user knows what they could get if they chose to sell anyway.

Relevant platforms for this category: ${platforms}

Return ONLY valid JSON:
{
  "active_listings": [
    {"title": "string", "price": number, "platform": "string", "condition": "string", "url": null}
  ],
  "sold_listings": [
    {"title": "string", "price": number, "platform": "string", "condition": "string", "date": "string"}
  ],
  "fast_sale_price": number or null,
  "recommended_price": number or null,
  "accept_offer_floor": number or null,
  "local_cash_price": number or null,
  "do_not_sell_below": number or null,
  "expected_sell_days": number or null,
  "pricing_notes": "detailed notes including data quality, confidence, and any caveats",
  "market_summary": "brief market overview",
  "not_worth_listing": boolean,
  "disposition_recommendation": "if not_worth_listing is true: local sale | bundle | donate | scrap | trash — else null"
}

Price tiers:
- fast_sale_price: sells in under 48h (10-15% below market)
- recommended_price: optimal balance of speed and profit
- accept_offer_floor: minimum to accept from a best-offer buyer
- local_cash_price: Facebook/OfferUp local (80-85% of recommended, no fees)
- do_not_sell_below: absolute floor after all fees`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_PRICE = 1_000_000;

/**
 * Accept a price from the model only when it is a finite, positive, sanely
 * bounded number. Anything else (string, negative, NaN, Infinity, absurd
 * value) becomes null so it is never written onto the item.
 */
function safePrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE) return null;
  return Math.round(n * 100) / 100;
}

function safeDays(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 3650) return null;
  return Math.round(n);
}

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

    const [itemRes, identRes, condRes] = await Promise.all([
      supabase.from("sneaker_items").select("*").eq("id", itemId).maybeSingle(),
      supabase.from("ai_identification").select("*").eq("item_id", itemId).maybeSingle(),
      supabase.from("condition_assessment").select("grade, detailed_notes").eq("item_id", itemId).maybeSingle(),
    ]);

    const item = itemRes.data;
    if (!item) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ident = identRes.data;
    const itemType: string = item.item_type || ident?.item_type || "general_unknown";

    const brand = item.brand || ident?.brand || "";
    const productName = item.product_name || ident?.product_name || "";
    const model = item.model || ident?.model || "";
    const modelNumber = item.model_number || ident?.model_number || "";
    const nickname = item.nickname || ident?.nickname || "";
    const styleCode = item.style_code || ident?.style_code || "";
    const size = item.size || ident?.size || "";
    const color = item.color || ident?.color || "";
    const condition = item.condition_grade || condRes.data?.grade || "";
    const conditionNotes = condRes.data?.detailed_notes || "";
    const materials = ident?.materials || "";

    const displayName = productName || [brand, model, nickname].filter(Boolean).join(" ") || "Unknown item";
    const searchQuery = [brand, productName || model, modelNumber || styleCode, nickname, color, size]
      .filter(Boolean).join(" ").trim();

    const systemPrompt = buildCompsPrompt(itemType);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Research market comps for:
Item Type: ${itemType.replace(/_/g, " ")}
Brand: ${brand || "Unknown"}
Product Name: ${displayName}
Model/Style: ${model || styleCode || "N/A"}
Model Number: ${modelNumber || "N/A"}
Color/Colorway: ${color || nickname || "N/A"}
Size: ${size || "N/A"}
Materials: ${materials || "N/A"}
Condition: ${condition || "Unknown"}
Condition Notes: ${conditionNotes || "None"}
Search Query: ${searchQuery}

Provide realistic pricing based on your training data. Return only JSON.`,
        },
      ],
      max_tokens: 1800,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    // The model's numbers are untrusted input: the prompt is built from item
    // fields any caller can write, so every price is bounds-checked before it
    // is stored or used as a listing price.
    const prices = {
      fast_sale_price: safePrice(parsed.fast_sale_price),
      recommended_price: safePrice(parsed.recommended_price),
      accept_offer_floor: safePrice(parsed.accept_offer_floor),
      local_cash_price: safePrice(parsed.local_cash_price),
      do_not_sell_below: safePrice(parsed.do_not_sell_below),
    };

    const { data: compData, error: compErr } = await supabase
      .from("comp_research")
      .upsert({
        item_id: itemId,
        active_listings: Array.isArray(parsed.active_listings) ? parsed.active_listings : [],
        sold_listings: Array.isArray(parsed.sold_listings) ? parsed.sold_listings : [],
        ...prices,
        expected_sell_days: safeDays(parsed.expected_sell_days),
        sources: [{ platform: "AI Research", query: searchQuery, item_type: itemType }],
        raw_response: parsed,
      }, { onConflict: "item_id" })
      .select()
      .single();

    if (compErr) {
      console.error("[compErr] database error:", compErr);
      return new Response(JSON.stringify({ error: "Could not save the result. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (prices.recommended_price !== null) {
      await supabase.from("sneaker_items").update({
        list_price: prices.recommended_price,
        accept_offer_floor: prices.accept_offer_floor,
        do_not_sell_below: prices.do_not_sell_below,
        local_cash_price: prices.local_cash_price,
      }).eq("id", itemId);
    }

    return new Response(
      JSON.stringify({
        comps: compData,
        notes: parsed.pricing_notes,
        summary: parsed.market_summary,
        not_worth_listing: !!parsed.not_worth_listing,
        disposition_recommendation: parsed.disposition_recommendation || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[comps-sneaker] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
