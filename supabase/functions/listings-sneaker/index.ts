import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildListingsPrompt(itemType: string): string {
  const sneakerSpecifics = `  "item_specifics": {
    "Brand": "string",
    "Model": "string",
    "Style Code": "string or N/A",
    "US Shoe Size (Men's)": "string or N/A",
    "US Shoe Size (Women's)": "string or N/A",
    "Color": "string",
    "Material": "string",
    "Condition": "string",
    "Department": "string",
    "Type": "Athletic",
    "Upper Material": "string"
  }`;

  const clothingSpecifics = `  "item_specifics": {
    "Brand": "string",
    "Size": "string",
    "Color": "string",
    "Material": "string or N/A",
    "Style": "string",
    "Department": "string",
    "Condition": "string"
  }`;

  const electronicsSpecifics = `  "item_specifics": {
    "Brand": "string",
    "Model": "string",
    "MPN": "model number or N/A",
    "Color": "string or N/A",
    "Storage Capacity": "string or N/A",
    "Connectivity": "string or N/A",
    "Condition": "string",
    "Included Items": "string"
  }`;

  const toolSpecifics = `  "item_specifics": {
    "Brand": "string",
    "Model": "string",
    "MPN": "model number or N/A",
    "Voltage": "string or N/A",
    "Power Source": "string",
    "Condition": "string",
    "Included Items": "string"
  }`;

  const watchSpecifics = `  "item_specifics": {
    "Brand": "string",
    "Model": "string",
    "Reference Number": "string or N/A",
    "Case Material": "string or N/A",
    "Band Material": "string or N/A",
    "Dial Color": "string or N/A",
    "Case Size": "string or N/A",
    "Condition": "string",
    "Included Items": "string"
  }`;

  const generalSpecifics = `  "item_specifics": {
    "Brand": "string or N/A",
    "Model": "string or N/A",
    "MPN": "model number or N/A",
    "Color": "string or N/A",
    "Material": "string or N/A",
    "Condition": "string",
    "Included Items": "string"
  }`;

  const specificsMap: Record<string, string> = {
    sneaker: sneakerSpecifics,
    clothing: clothingSpecifics,
    electronics: electronicsSpecifics,
    tool: toolSpecifics,
    appliance: electronicsSpecifics,
    watch: watchSpecifics,
    jewelry: watchSpecifics,
  };

  const specifics = specificsMap[itemType] || generalSpecifics;

  return `You are a professional resale listing copywriter specializing in ${itemType.replace(/_/g, " ")} items. Create optimized, SEO-rich listings for all major platforms.

RULES:
- eBay title: EXACTLY under 80 characters, front-load the most searchable keywords
- Titles: no ALL CAPS, no spammy punctuation, keyword-rich but readable
- Descriptions: honest, buyer-friendly, highlight condition accurately — never exaggerate
- Never claim authenticity without visible evidence
- Use item-specific keywords buyers actually search for
- If the item has a flaw, mention it clearly — builds trust and reduces returns

Return ONLY valid JSON:
{
  "ebay_title": "string (max 80 chars)",
  "facebook_title": "string",
  "mercari_title": "string",
  "offerup_title": "string",
  "ebay_description": "string (HTML ok, detailed with specs and condition)",
  "facebook_description": "string (friendly, local buyer tone)",
  "mercari_description": "string (concise, bullet-point friendly)",
  "offerup_description": "string (brief, local sale tone)",
${specifics},
  "keyword_bank": ["array", "of", "search", "keywords"],
  "hashtags": ["#hashtag", "#list"],
  "photo_feedback": ["suggested photo improvements"],
  "platform_strategy": "recommended platform priority and pricing approach"
}`;
}

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

    const [itemRes, identRes, condRes, compRes] = await Promise.all([
      supabase.from("sneaker_items").select("*").eq("id", itemId).maybeSingle(),
      supabase.from("ai_identification").select("*").eq("item_id", itemId).maybeSingle(),
      supabase.from("condition_assessment").select("grade, detailed_notes").eq("item_id", itemId).maybeSingle(),
      supabase.from("comp_research").select("recommended_price, fast_sale_price").eq("item_id", itemId).maybeSingle(),
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
    const serialNumber = item.serial_number || ident?.serial_number || "";
    const nickname = item.nickname || ident?.nickname || "";
    const styleCode = item.style_code || ident?.style_code || "";
    const size = item.size || ident?.size || "";
    const color = item.color || ident?.color || "";
    const measurements = item.measurements || ident?.measurements || "";
    const materials = ident?.materials || "";
    const includedAccessories = ident?.included_accessories || "";
    const missingAccessories = ident?.missing_accessories || "";
    const testingStatus = ident?.testing_status || "";
    const authenticityNotes = ident?.authenticity_notes || "";
    const gender = item.gender || ident?.gender || "";
    const condition = item.condition_grade || condRes.data?.grade || "";
    const conditionNotes = condRes.data?.detailed_notes || "";
    const price = item.list_price || compRes.data?.recommended_price || 0;

    const systemPrompt = buildListingsPrompt(itemType);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Write listings for this ${itemType.replace(/_/g, " ")}:
Brand: ${brand || "Unknown"}
Product Name: ${productName || model || "Unknown"}
Model / Style: ${model || styleCode || "N/A"}
Model Number: ${modelNumber || "N/A"}
Serial Number: ${serialNumber || "N/A"}
Colorway / Nickname: ${nickname || color || "N/A"}
Style Code: ${styleCode || "N/A"}
Size: ${size || "N/A"}
Gender / Category: ${gender || "N/A"}
Color: ${color || "N/A"}
Measurements: ${measurements || "N/A"}
Materials: ${materials || "N/A"}
Included Accessories: ${includedAccessories || "N/A"}
Missing Accessories: ${missingAccessories || "None"}
Testing Status: ${testingStatus || "N/A"}
Authenticity Notes: ${authenticityNotes || "N/A"}
Condition Grade: ${condition || "Unknown"}
Condition Notes: ${conditionNotes || "None"}
List Price: $${price || "TBD"}

Generate complete, production-ready listings. Return only JSON.`,
        },
      ],
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const { data: listingData, error: listErr } = await supabase
      .from("listing_content")
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
      }, { onConflict: "item_id" })
      .select()
      .single();

    if (listErr) {
      console.error("[listErr] database error:", listErr);
      return new Response(JSON.stringify({ error: "Could not save the result. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: currentItem } = await supabase
      .from("sneaker_items")
      .select("status")
      .eq("id", itemId)
      .maybeSingle();

    if (currentItem && !["listed", "sold"].includes(currentItem.status)) {
      await supabase.from("sneaker_items").update({ status: "needs_review" }).eq("id", itemId);
    }

    return new Response(
      JSON.stringify({ listing: listingData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[listings-sneaker] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
