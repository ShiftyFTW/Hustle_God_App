import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildConditionPrompt(itemType: string): string {
  const sneakerFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "outsole_wear": "none|light|moderate|heavy",
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
  "detailed_notes": "honest paragraph for buyer transparency",
  "photo_feedback": ["missing or suggested photos"]
}`;

  const clothingFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "missing_insoles": false,
  "sole_separation": false,
  "odor_risk": boolean,
  "detailed_notes": "describe fading, pilling, holes, worn areas, stains, missing buttons, zipper issues, and any alterations",
  "photo_feedback": ["suggested photos: flat lay, size tag, care tag, close-up of any flaws"]
}`;

  const electronicsFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "missing_insoles": false,
  "sole_separation": false,
  "odor_risk": false,
  "detailed_notes": "describe screen condition, housing damage, port wear, button condition, battery issues, any non-functional features, and what testing was observed",
  "photo_feedback": ["suggested photos: screen on, ports, all sides, serial number plate, accessories"]
}`;

  const toolFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "missing_insoles": false,
  "sole_separation": false,
  "odor_risk": false,
  "detailed_notes": "describe wear on housing, chuck, blade guard, any rust or corrosion, battery condition if applicable, trigger/switch function, and included accessories",
  "photo_feedback": ["suggested photos: model plate, all sides, battery/charger, any damage"]
}`;

  const watchFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "missing_insoles": false,
  "sole_separation": false,
  "odor_risk": false,
  "detailed_notes": "describe crystal condition, case scratches, bracelet/strap wear, crown function, lume condition, bezel condition, and whether it is running",
  "photo_feedback": ["suggested photos: dial close-up, caseback, bracelet/clasp, crown, any scratches"]
}`;

  const generalFields = `{
  "grade": "new_with_box|new_without_box|pre_owned_excellent|pre_owned_good|pre_owned_fair|damaged_flawed",
  "scuffs": "none|minor|moderate|significant",
  "stains": "none|minor|moderate|significant",
  "missing_insoles": false,
  "sole_separation": false,
  "odor_risk": boolean,
  "detailed_notes": "honest and specific description of all visible wear, damage, and functional observations",
  "photo_feedback": ["suggested photos to improve the listing"]
}`;

  const fieldMap: Record<string, string> = {
    sneaker: sneakerFields,
    clothing: clothingFields,
    electronics: electronicsFields,
    tool: toolFields,
    appliance: electronicsFields,
    watch: watchFields,
    jewelry: watchFields,
  };

  const fields = fieldMap[itemType] || generalFields;

  const gradeDefinitions = `Grade definitions:
- new_with_box: unused, original packaging present
- new_without_box: unused or like-new, no original packaging
- pre_owned_excellent: light use, no significant flaws
- pre_owned_good: normal use, minor flaws
- pre_owned_fair: visible wear, noticeable flaws
- damaged_flawed: significant damage, needs repair`;

  return `You are a professional resale condition grader specializing in ${itemType.replace(/_/g, " ")} items. Analyze the photos and provide an honest condition assessment.

Return ONLY valid JSON:
${fields}

${gradeDefinitions}

IMPORTANT: Be honest and conservative. Never upgrade grade beyond what photos clearly support.`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_GRADES = [
  "new_with_box",
  "new_without_box",
  "pre_owned_excellent",
  "pre_owned_good",
  "pre_owned_fair",
  "damaged_flawed",
];

/** Only store a grade the app actually understands. */
function safeGrade(value: unknown): string | null {
  return typeof value === "string" && VALID_GRADES.includes(value) ? value : null;
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

    const [imagesRes, idRes] = await Promise.all([
      supabase.from("sneaker_images").select("*").eq("item_id", itemId).order("sort_order"),
      supabase.from("ai_identification").select("item_type").eq("item_id", itemId).maybeSingle(),
    ]);

    const images = imagesRes.data;
    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images found. Upload photos first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const itemType = idRes.data?.item_type || "general_unknown";

    // Prioritize detail/flaw images for condition
    const prioritized = [
      ...images.filter((i: { label: string }) =>
        ["outsole", "flaw", "side", "back", "hero", "size_tag"].includes(i.label)
      ),
      ...images.filter((i: { label: string }) =>
        !["outsole", "flaw", "side", "back", "hero", "size_tag"].includes(i.label)
      ),
    ].slice(0, 6);

    const imageContent = prioritized.map((img: { public_url: string }) => ({
      type: "image_url" as const,
      image_url: { url: img.public_url, detail: "high" as const },
    }));

    const systemPrompt = buildConditionPrompt(itemType);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Assess the condition of this ${itemType.replace(/_/g, " ")}. Return only the JSON.`,
            },
            ...imageContent,
          ],
        },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const { data: assessData, error: assErr } = await supabase
      .from("condition_assessment")
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
      }, { onConflict: "item_id" })
      .select()
      .single();

    if (assErr) {
      console.error("[assErr] database error:", assErr);
      return new Response(JSON.stringify({ error: "Could not save the result. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validatedGrade = safeGrade(parsed.grade);
    if (validatedGrade) {
      await supabase.from("sneaker_items").update({ condition_grade: validatedGrade }).eq("id", itemId);
    }

    return new Response(
      JSON.stringify({ assessment: assessData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[condition-sneaker] unhandled error:", err);
    return new Response(JSON.stringify({ error: "The request could not be completed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
