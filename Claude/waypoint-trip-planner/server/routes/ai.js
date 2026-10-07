// Claude-powered endpoints. The API key never leaves the server.
//
// /plan and /cheaper stream NDJSON events section by section: Claude emits each
// plan section through an emit_* tool call; every tool input is validated with
// the shared Zod schema, enriched with real OpenStreetMap coordinates, and only
// then forwarded to the browser. Invalid or missing sections are sent back to
// Claude as tool errors so it can correct itself.
import { Router } from "express";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { TripRequestSchema, SavedTripSchema, SECTION_SCHEMAS } from "../../shared/schema.js";
import { TOOLS, sectionForTool } from "../lib/tools.js";
import { PLAN_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, buildPlanContext, buildChatContext, compactPlan } from "../lib/prompt.js";
import { getLiveSnapshot } from "../lib/live.js";
import { nearbyPlaces, placeIndex } from "../services/places.js";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const PLAN_EFFORT = process.env.PLAN_EFFORT || "medium";
const CHAT_EFFORT = process.env.CHAT_EFFORT || "low";
const MAX_TURNS = 4;

let client;
const anthropic = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY from the environment

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Adaptive thinking + effort only exist on current-generation models.
const MODERN = /^claude-(fable-5|opus-5|sonnet-5|opus-4-[678]|sonnet-4-6)/;
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

function requestParams(effort) {
  const params = {};
  if (MODERN.test(MODEL)) {
    params.thinking = { type: "adaptive", display: "summarized" };
    params.output_config = { effort };
  }
  // Server-side refusal fallback: if a safety classifier declines, the API
  // re-runs the request on an appropriate model inside the same call.
  if (FALLBACK_MODELS.has(MODEL) && process.env.ANTHROPIC_FALLBACKS !== "off") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
}

class PublicError extends Error {}

function publicMessage(err) {
  if (err instanceof PublicError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key is missing or invalid. Check ANTHROPIC_API_KEY in .env.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to the configured model.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limited right now — please try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message.slice(0, 240)}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API — check your connection.";
  if (err instanceof Anthropic.APIError) return "Claude is temporarily unavailable — please try again shortly.";
  return "Something went wrong while talking to Claude.";
}

/** Opens an NDJSON stream; aborts upstream work if the browser disconnects. */
function openStream(res) {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  const send = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  };
  return { send, signal: controller.signal, end: () => res.end() };
}

function thinkingRelay(send) {
  let buffer = "";
  let last = 0;
  return (delta) => {
    buffer = (buffer + delta).slice(-600);
    const now = Date.now();
    if (now - last < 700) return;
    last = now;
    const text = buffer.replace(/\s+/g, " ").trim().slice(-170);
    if (text) send({ type: "thinking", text });
  };
}

/* ------------------------------ enrichment ------------------------------ */

function resolver(index) {
  return (item) => {
    const place = item.placeId ? index.get(item.placeId) : null;
    if (place) return { ...item, lat: place.lat, lon: place.lon, verified: true };
    return { ...item, placeId: null, lat: null, lon: null, verified: false };
  };
}

function enrich(section, data, index, trip) {
  const resolve = resolver(index);
  switch (section) {
    case "day": {
      const date = new Date(`${trip.startDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + data.day - 1);
      return {
        ...data,
        key: randomUUID(),
        date: date.toISOString().slice(0, 10), // keep dates consistent with the trip
        activities: data.activities.map((a) => ({ ...resolve(a), id: randomUUID() })),
        rainPlanB: { ...data.rainPlanB, swaps: data.rainPlanB.swaps.map(resolve) },
      };
    }
    case "stays":
      return {
        ...data,
        tiers: Object.fromEntries(Object.entries(data.tiers).map(([tier, opts]) => [tier, opts.map(resolve)])),
      };
    case "food":
      return {
        ...data,
        daily: data.daily
          .filter((m) => m.day <= trip.days)
          .map((m) => ({ ...m, breakfast: resolve(m.breakfast), lunch: resolve(m.lunch), dinner: resolve(m.dinner) })),
      };
    default:
      return data;
  }
}

/* ------------------------------ section loop ----------------------------- */

const sectionKey = (section, data) => (section === "day" ? `day:${data.day}` : section);
const describe = (keys) => keys.map((k) => k.replace("day:", "day ")).join(", ");

function zodSummary(error) {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

async function streamSections({ userContent, required, trip, index, send, signal }) {
  const messages = [{ role: "user", content: userContent }];
  const done = new Set();
  const missing = () => required.filter((k) => !done.has(k));
  let jsonRetries = 0;

  for (let turn = 0; turn < MAX_TURNS && missing().length; turn++) {
    const results = new Map(); // tool_use id -> { key } | { error }
    const relayThinking = thinkingRelay(send);

    const stream = anthropic().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        system: [{ type: "text", text: PLAN_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        tool_choice: { type: "auto" },
        messages,
        ...requestParams(PLAN_EFFORT),
      },
      { signal },
    );

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        const section = sectionForTool[event.content_block.name];
        if (section) send({ type: "section_start", section });
      }
    });
    stream.on("thinking", relayThinking);
    stream.on("contentBlock", (block) => {
      if (block.type !== "tool_use") return;
      const section = sectionForTool[block.name];
      if (!section) return results.set(block.id, { error: `Unknown tool ${block.name}` });
      const parsed = SECTION_SCHEMAS[section].safeParse(block.input);
      if (!parsed.success) {
        send({ type: "section_retry", section });
        return results.set(block.id, { error: `Schema validation failed — ${zodSummary(parsed.error)}. Fix and call ${block.name} again.` });
      }
      if (section === "day" && parsed.data.day > trip.days) {
        return results.set(block.id, { error: `day ${parsed.data.day} is outside this ${trip.days}-day trip.` });
      }
      const key = sectionKey(section, parsed.data);
      done.add(key);
      results.set(block.id, { key });
      send({ type: "section", section, data: enrich(section, parsed.data, index, trip) });
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, a tool input that isn't parseable JSON
      // rejects here. Re-issue the turn once; rethrow API errors and aborts.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 1) throw err;
      send({ type: "status", message: "Re-requesting a malformed section…" });
      continue;
    }

    const u = message.usage ?? {};
    console.log(
      `[ai] turn ${turn + 1} stop=${message.stop_reason} in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0}`,
    );

    if (message.stop_reason === "refusal") {
      throw new PublicError("Claude declined to plan this request. Try rephrasing your notes or destination.");
    }

    const toolBlocks = message.content.filter((b) => b.type === "tool_use");
    if (message.stop_reason === "max_tokens" && toolBlocks.length) {
      // The final tool input may be truncated even if it validated: redo it.
      const last = toolBlocks.at(-1);
      const r = results.get(last.id);
      if (r?.key) done.delete(r.key);
      results.set(last.id, { error: "Output was cut off (max_tokens). Re-emit this section more concisely." });
    }

    const stillMissing = missing();
    if (!stillMissing.length) break;

    messages.push({ role: "assistant", content: message.content });
    const content = toolBlocks.map((b) => {
      const r = results.get(b.id) ?? { error: "Not processed — call this tool again." };
      return r.error
        ? { type: "tool_result", tool_use_id: b.id, is_error: true, content: r.error }
        : { type: "tool_result", tool_use_id: b.id, content: "Saved." };
    });
    content.push({
      type: "text",
      text: `Still needed: ${describe(stillMissing)}. Call the emit_* tools for exactly these now; sections already saved must not be repeated.`,
    });
    messages.push({ role: "user", content });
    send({ type: "status", message: `Filling in ${describe(stillMissing)}…` });
  }

  if (missing().length) throw new PublicError(`The plan came back incomplete (missing ${describe(missing())}). Please try again.`);
}

const requiredKeys = (days, { extras }) => [
  "overview",
  ...Array.from({ length: days }, (_, i) => `day:${i + 1}`),
  "stays",
  "food",
  "transport",
  ...(extras ? ["extras"] : []),
];

async function gatherContext(trip, { withPlaces = true } = {}) {
  const d = trip.destination;
  const [live, places] = await Promise.all([
    getLiveSnapshot({
      lat: d.lat,
      lon: d.lon,
      countryCode: d.countryCode,
      countryName: d.country,
      timezone: d.timezone,
      startDate: trip.startDate,
      days: trip.days,
      currency: trip.currency,
    }),
    withPlaces
      ? nearbyPlaces(d.lat, d.lon).catch((err) => {
          console.warn("[ai] places unavailable:", err.message);
          return null;
        })
      : null,
  ]);
  return { live, places };
}

/* --------------------------------- routes -------------------------------- */

export const aiRouter = Router();

aiRouter.use((req, res, next) => {
  if (aiConfigured()) return next();
  res.status(503).json({
    code: "AI_NOT_CONFIGURED",
    error: "AI planning is off: add ANTHROPIC_API_KEY to the .env file and restart the server. Live data still works.",
  });
});

aiRouter.post("/plan", async (req, res) => {
  const parsed = TripRequestSchema.safeParse(req.body?.request);
  if (!parsed.success) return res.status(400).json({ error: "Invalid trip request", issues: zodSummary(parsed.error) });
  const trip = parsed.data;
  const { send, signal, end } = openStream(res);
  try {
    send({ type: "status", message: "Reading live conditions and mapping real places nearby…" });
    const { live, places } = await gatherContext(trip);
    if (signal.aborted) return;
    send({ type: "status", message: places ? "Claude is drafting your plan…" : "Places lookup unavailable — Claude is planning with landmarks only…" });
    const userContent = `${buildPlanContext({ trip, live, places })}\n\n<task>Plan this trip now using the emit_* tools.</task>`;
    await streamSections({ userContent, required: requiredKeys(trip.days, { extras: true }), trip, index: placeIndex(places), send, signal });
    send({ type: "done" });
  } catch (err) {
    if (!signal.aborted) {
      console.error("[ai/plan]", err?.constructor?.name, err?.message);
      send({ type: "error", message: publicMessage(err) });
    }
  } finally {
    end();
  }
});

const PlanPayload = SavedTripSchema.shape.plan;

aiRouter.post("/cheaper", async (req, res) => {
  const body = z
    .object({ request: TripRequestSchema, plan: PlanPayload, total: z.number().min(0).max(1e9) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid plan payload", issues: zodSummary(body.error) });
  const { request: trip, plan, total } = body.data;
  const { send, signal, end } = openStream(res);
  try {
    send({ type: "status", message: "Hunting for savings…" });
    const { live, places } = await gatherContext(trip);
    if (signal.aborted) return;
    const userContent = `${buildPlanContext({ trip, live, places })}

<current_plan currency="${trip.currency}">
${compactPlan(plan, trip.currency)}
</current_plan>

<task>The traveler pressed "Make it cheaper". The current plan's estimated total is ${Math.round(total)} ${trip.currency} (budget ${trip.budget} ${trip.currency}). Rework it to cost at least 20–30% less while keeping the trip's best moments: swap paid stops for free equivalents or their budgetAlternative, pick cheaper but safe and well-located stays, lean on markets and street food (respecting diet rules), favour walking/transit and money-saving passes. Re-emit emit_overview (budgetVerdict must say what changed and roughly how much it saves), every emit_day from 1 to ${trip.days}, then emit_stays, emit_food and emit_transport. Do not call emit_extras.</task>`;
    await streamSections({ userContent, required: requiredKeys(trip.days, { extras: false }), trip, index: placeIndex(places), send, signal });
    send({ type: "done" });
  } catch (err) {
    if (!signal.aborted) {
      console.error("[ai/cheaper]", err?.constructor?.name, err?.message);
      send({ type: "error", message: publicMessage(err) });
    }
  } finally {
    end();
  }
});

const ChatBody = z.object({
  request: TripRequestSchema.optional(),
  plan: z.unknown().optional(),
  total: z.number().min(0).max(1e9).optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(24),
});

aiRouter.post("/chat", async (req, res) => {
  const body = ChatBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid chat payload", issues: zodSummary(body.error) });
  const { request: trip, total } = body.data;
  const plan = body.data.plan ? PlanPayload.safeParse(body.data.plan).data ?? null : null;

  // The conversation must start with a user turn and end with one.
  const history = body.data.messages.slice(body.data.messages.findIndex((m) => m.role === "user"));
  if (!history.length || history.at(-1).role !== "user") return res.status(400).json({ error: "Last message must be from the user" });

  const { send, signal, end } = openStream(res);
  try {
    let live = null;
    if (trip) live = (await gatherContext(trip, { withPlaces: false })).live;
    const context = buildChatContext({ trip, live, plan, totals: total != null ? { total: Math.round(total) } : null });
    const stream = anthropic().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        system: [
          { type: "text", text: CHAT_SYSTEM_PROMPT },
          { type: "text", text: `<trip_context>\n${context || "No trip planned yet."}\n</trip_context>`, cache_control: { type: "ephemeral" } },
        ],
        messages: history,
        ...requestParams(CHAT_EFFORT),
      },
      { signal },
    );
    stream.on("text", (delta) => send({ type: "text", delta }));
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") send({ type: "error", message: "Claude declined to answer that one." });
    send({ type: "done" });
  } catch (err) {
    if (!signal.aborted) {
      console.error("[ai/chat]", err?.constructor?.name, err?.message);
      send({ type: "error", message: publicMessage(err) });
    }
  } finally {
    end();
  }
});
