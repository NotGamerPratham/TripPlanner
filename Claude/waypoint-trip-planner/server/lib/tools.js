// Claude tool definitions, generated from the shared Zod schemas so the
// schema Claude sees and the schema the server validates against are the same.
import { z } from "zod";
import { SECTION_SCHEMAS } from "../../shared/schema.js";

export const TOOL_NAMES = {
  overview: "emit_overview",
  day: "emit_day",
  stays: "emit_stays",
  food: "emit_food",
  transport: "emit_transport",
  extras: "emit_extras",
};

const DESCRIPTIONS = {
  overview: "Save the trip overview. Call exactly once, before any other emit_* tool.",
  day: "Save ONE itinerary day. Call once per trip day, in order (day 1, 2, … N), immediately after emit_overview.",
  stays: "Save accommodation options: 1–3 per tier (backpacker, mid, luxury). Call once, after all days.",
  food: "Save the food guide, including breakfast/lunch/dinner for every trip day. Call once, after emit_stays.",
  transport: "Save how to get there from the start city and how to get around locally. Call once, after emit_food.",
  extras: "Save money-saving hacks, packing list, safety tips, common scams and emergency numbers. Call once, last.",
};

export const sectionForTool = Object.fromEntries(Object.entries(TOOL_NAMES).map(([s, n]) => [n, s]));

function toInputSchema(schema) {
  const json = z.toJSONSchema(schema);
  delete json.$schema;
  return json;
}

export const TOOLS = Object.entries(SECTION_SCHEMAS).map(([section, schema]) => ({
  name: TOOL_NAMES[section],
  description: DESCRIPTIONS[section],
  input_schema: toInputSchema(schema),
  // Stream inputs as generated; the server validates every input with Zod.
  eager_input_streaming: true,
}));
