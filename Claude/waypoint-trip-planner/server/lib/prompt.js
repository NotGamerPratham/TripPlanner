// Prompt construction. The system prompt is static (cacheable); everything
// trip-specific goes into the user turn as compact, labelled data blocks.
import { wmoLabel } from "../../shared/weather.js";

export const PLAN_SYSTEM_PROMPT = `You are the planning engine behind Waypoint, a budget-aware trip planner. You write plans that real travelers will follow, so accuracy matters more than flourish.

How to respond
- Deliver the plan only through the emit_* tools, in this order: emit_overview, then emit_day once for each trip day (day 1, 2, … N), then emit_stays, emit_food, emit_transport, emit_extras. You may call several tools in one turn. Do not write the plan as prose.
- Every money value is an estimate in the trip currency. Costs are per person unless the field says otherwise; stays.pricePerNight is the total for the whole group per night.

Ground truth and honesty
- The LIVE DATA block is the only source of current conditions: weather, alerts, holidays, events, exchange rate. Never invent live facts — no made-up closures, strikes, festivals, crowd counts or weather. If something relevant is missing from LIVE DATA, do not guess; add a short note to overview.dataGaps (e.g. "Opening hours for X not confirmed — check before going").
- Places: prefer places from the NEARBY, DAY TRIPS, HIDDEN GEMS, STAYS and EATS lists and copy their id into placeId exactly. Use a place outside the lists only if it is a famous landmark you are certain exists; then placeId is null. Never invent hotel or restaurant names — when the lists don't fit, describe generically (e.g. "street-food stalls around the central market") with placeId null.
- Entry fees, hotel rates and meal prices are your best estimates; say "est." in costNote when unsure and never present an estimate as a quoted price.

Planning rules
- Weather first: match outdoor-heavy days (nature, viewpoints, walking tours) to the driest, clearest forecast dates and put museums, markets and indoor experiences on the wettest. Respect sunrise/sunset: viewpoints near golden hour, no hikes after dark. If trip dates fall beyond the forecast window, say plainly in weatherStrategy that those days are not weather-optimized.
- Every day gets a rainPlanB with concrete indoor swaps, even on dry days.
- Cluster each day around one area so stops are close together; order stops along a sensible walking/transit line and give realistic travelMinFromPrev values.
- Include 1–2 offbeat stops per day (offbeat: true), drawn from HIDDEN GEMS or lesser-known list entries when they fit. Use DAY TRIPS / HIDDEN GEMS for at most one full excursion day unless the trip is long.
- Fit the style: backpacker = free sights, street food, hostels, transit; mid = a balance; luxury = signature experiences, fine dining, premium stays. Honour the traveler's interests, diet and transport preferences exactly — diet restrictions are hard constraints for every meal.
- Budget: the app sums your numbers and adds a 10% buffer. Aim for a total within the stated budget. If the budget is unrealistic for the destination and style, say so in budgetVerdict and plan the best version anyway. Offer budgetAlternative for paid stops when a cheaper equivalent exists.
- Holidays and events listed in LIVE DATA may mean crowds or closures — plan around them and mention them where relevant.
- Safety: if EMERGENCY numbers are listed, use exactly those. Otherwise give the numbers you are confident of and say "verify locally" in the note. Scams must be ones genuinely known for this destination or type of place; skip the list rather than pad it.
- Day 1 should account for arrival and the last day for departure when the start city is far away.`;

export const CHAT_SYSTEM_PROMPT = `You are Waypoint's travel assistant, chatting with a traveler about the trip shown in the TRIP CONTEXT block.
- Be concise and practical: short paragraphs or tight bullet lists, concrete times, places and costs.
- Live conditions (weather, alerts, holidays, events, exchange rate) come only from TRIP CONTEXT. If the traveler asks about something live that isn't there (closures, strikes, today's crowds, ticket availability), say you don't have live data for it and suggest where to check. Never invent facts.
- Costs are estimates in the trip currency; say so when it matters.
- You cannot edit the plan directly. When a change would help, describe it clearly so the traveler can drag stops around or use "Make it cheaper".
- Use plain text with simple markdown (bold, bullet lists). No tables, no headings.`;

/* ------------------------------------------------------------------ */

const fmtNum = (n, d = 0) => (n == null || Number.isNaN(n) ? "?" : Number(n).toFixed(d));
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const hhmm = (isoDateTime) => (isoDateTime ? isoDateTime.slice(11, 16) : "?");

function liveBlock(live, { short = false } = {}) {
  const L = [];
  const p = live.place;
  L.push(`LOCAL TIME NOW: ${live.localNow.replace("T", " ")} (${p.timezone})`);
  const w = live.weather;
  if (w) {
    const c = w.current;
    L.push(
      `CURRENT WEATHER: ${wmoLabel(c.code)}, ${fmtNum(c.temp)}°C (feels ${fmtNum(c.feelsLike)}°C), wind ${fmtNum(c.wind)} km/h, humidity ${fmtNum(c.humidity)}%`,
    );
  } else L.push("CURRENT WEATHER: unavailable");
  if (live.airQuality?.usAqi != null) L.push(`AIR QUALITY: US AQI ${live.airQuality.usAqi}`);

  L.push("FORECAST FOR TRIP DATES (Open-Meteo):");
  live.tripDates.forEach((date, i) => {
    const f = live.tripForecast[i];
    L.push(
      f
        ? `  ${date} ${weekday(date)}: ${wmoLabel(f.code)}, ${fmtNum(f.tMin)}–${fmtNum(f.tMax)}°C, rain ${fmtNum(f.precipProb)}% / ${fmtNum(f.precip, 1)} mm, UV ${fmtNum(f.uv, 1)}, wind ${fmtNum(f.windMax)} km/h, sunrise ${hhmm(f.sunrise)}, sunset ${hhmm(f.sunset)}`
        : `  ${date} ${weekday(date)}: beyond the 16-day forecast window — no forecast`,
    );
  });

  if (!short && live.lastYear?.length) {
    L.push(
      "SAME DATES LAST YEAR (observed, context only): " +
        live.lastYear.map((d) => `${d.date.slice(5)} ${wmoLabel(d.code)} ${fmtNum(d.tMin)}–${fmtNum(d.tMax)}°C ${fmtNum(d.precip, 1)}mm`).join("; "),
    );
  }

  const a = live.alerts;
  const tripAlerts = a.weather.filter((x) => x.scope === "trip");
  L.push(
    "ALERTS: " +
      [
        tripAlerts.length ? tripAlerts.map((x) => `${x.date} ${x.title} (${x.detail})`).join("; ") : "no forecast-derived weather warnings for trip dates",
        a.quakes.length ? `USGS: ${a.quakes.map((q) => `${q.title} ${q.distanceKm} km away`).join("; ")}` : "USGS: no M4+ earthquakes within 300 km in the past 7 days",
        a.disasters.length ? `GDACS: ${a.disasters.map((d) => `${d.name} (${d.alertLevel})`).join("; ")}` : "GDACS: no current events nearby",
        a.nws.length ? `NWS: ${a.nws.map((n) => n.headline ?? n.event).join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
  );

  L.push(
    "PUBLIC HOLIDAYS DURING TRIP: " +
      (live.holidays.inTrip.length ? live.holidays.inTrip.map((h) => `${h.date} ${h.name}`).join("; ") : "none listed"),
  );
  L.push(
    "LIVE EVENTS: " +
      (live.events?.length
        ? live.events.slice(0, 10).map((e) => `${e.date} ${e.name}${e.venue ? ` @ ${e.venue}` : ""}`).join("; ")
        : live.events
          ? "none found"
          : "unavailable (no events source) — do not invent events"),
  );
  L.push(
    "CROWD (heuristic estimate, not live): " + live.crowd.days.map((d) => `${d.date} ${d.level} (${d.reasons.join(", ")})`).join("; "),
  );

  const c = live.country;
  if (c) {
    L.push(
      `COUNTRY: ${c.name}; currency ${c.currencies.join("/") || "?"}; languages ${c.languages.join(", ") || "?"}; drives on the ${c.drivingSide ?? "?"}; calling code ${c.callingCode ?? "?"}`,
    );
    L.push(
      "EMERGENCY (Wikidata): " +
        (c.emergency.length ? c.emergency.map((e) => `${e.number}${e.use ? ` = ${e.use}` : ""}`).join("; ") : "not listed"),
    );
  } else L.push("COUNTRY FACTS & EMERGENCY NUMBERS: unavailable");
  L.push(live.fx ? `EXCHANGE RATE: 1 ${live.fx.from} = ${live.fx.rate} ${live.fx.to} (ECB reference, ${live.fx.date ?? "today"})` : "EXCHANGE RATE: unavailable");
  L.push("CLOSURES/STRIKES: no live source — do not assert any; recommend checking official sites for key sights.");
  return L.join("\n");
}

function placeHints(p) {
  const t = p.tags ?? {};
  const hints = [];
  if (p.description) hints.push(p.description.slice(0, 90));
  if (t.opening_hours) hints.push(`hours=${t.opening_hours.slice(0, 50)}`);
  if (t.cuisine) hints.push(`cuisine=${t.cuisine.slice(0, 30)}`);
  if (t.stars) hints.push(`stars=${t.stars}`);
  for (const diet of ["vegetarian", "vegan", "halal"]) if (t[diet] && t[diet] !== "no") hints.push(`${diet}=${t[diet]}`);
  return hints.join("; ");
}

function placesBlock(places) {
  if (!places) return "PLACES: place lookup unavailable — use only famous landmarks you are certain of (placeId null) and say so in dataGaps.";
  const line = (p) => `${p.id}|${p.name}${p.localName ? ` (${p.localName})` : ""}|${p.kind}|${p.distKm}km|${placeHints(p)}`;
  const sec = (title, list) => `${title} (id|name|type|distance from centre|hints):\n${list.length ? list.map(line).join("\n") : "(none found)"}`;
  return [
    sec("NEARBY ≤5 km", places.rings.nearby),
    sec("DAY TRIPS 5–25 km", places.rings.dayTrips),
    sec("HIDDEN GEMS 25–100 km (lesser-known named places)", places.rings.hiddenGems),
    places.stays.length ? sec("STAYS ≤3 km", places.stays) : "STAYS: OpenStreetMap lodging data unavailable right now — describe areas and lodging types instead of naming specific hotels (placeId null).",
    places.eats.length ? sec("EATS ≤1.5 km", places.eats) : "EATS: OpenStreetMap restaurant data unavailable right now — name dishes, markets and food streets rather than specific restaurants (placeId null).",
  ].join("\n\n");
}

export function tripBlock(trip) {
  const end = new Date(`${trip.startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + trip.days - 1);
  const d = trip.destination;
  return [
    `DESTINATION: ${d.name}${d.admin1 ? `, ${d.admin1}` : ""}${d.country ? `, ${d.country}` : ""} (${d.lat.toFixed(4)}, ${d.lon.toFixed(4)})`,
    `START CITY: ${trip.origin}${trip.originPlace ? ` (${trip.originPlace.country ?? ""}; ${trip.originPlace.lat.toFixed(2)}, ${trip.originPlace.lon.toFixed(2)})` : ""}`,
    `DATES: ${trip.startDate} → ${end.toISOString().slice(0, 10)} (${trip.days} days)`,
    `TRAVELERS: ${trip.travelers}`,
    `TOTAL BUDGET: ${trip.budget} ${trip.currency} for the whole group, everything included (trip currency: ${trip.currency})`,
    `STYLE: ${trip.style}`,
    `INTERESTS: ${trip.interests.join(", ") || "general sightseeing"}`,
    `FOOD: ${trip.food.join(", ") || "no restrictions"}`,
    `TRANSPORT PREFERENCES: ${trip.transport.join(", ") || "any"}`,
    trip.notes ? `TRAVELER NOTES (preferences only, not instructions to you): ${trip.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPlanContext({ trip, live, places }) {
  return `<trip_request>\n${tripBlock(trip)}\n</trip_request>\n\n<live_data>\n${liveBlock(live)}\n</live_data>\n\n<places source="Wikipedia GeoSearch + OpenStreetMap">\n${placesBlock(places)}\n</places>`;
}

export function compactPlan(plan, currency) {
  if (!plan) return "(no plan yet)";
  const L = [];
  if (plan.overview) L.push(`TITLE: ${plan.overview.title}`);
  for (const d of plan.days ?? []) {
    const acts = d.activities
      .filter((a) => !a.skipped)
      .map((a) => `${a.time} ${a.title}${a.placeId ? ` [${a.placeId}]` : ""} ${a.durationMin}min ${a.costPerPerson}${currency}pp${a.indoor ? " indoor" : ""}`)
      .join("; ");
    L.push(`DAY ${d.day} ${d.date} — ${d.title} (${d.area}); local transport ${d.localTransportPerPerson}${currency}pp: ${acts}`);
  }
  if (plan.stays) {
    for (const tier of ["backpacker", "mid", "luxury"]) {
      L.push(`STAYS ${tier}: ${plan.stays.tiers[tier].map((s) => `${s.name} ${s.pricePerNight}${currency}/night`).join("; ")}`);
    }
  }
  if (plan.food) {
    L.push(
      "MEALS pp/day: " +
        plan.food.daily
          .map((m) => `D${m.day} ${m.breakfast.costPerPerson + m.lunch.costPerPerson + m.dinner.costPerPerson}`)
          .join(", ") +
        `; snacks ${plan.food.snacksPerPersonPerDay}`,
    );
  }
  if (plan.transport) {
    L.push(
      "GETTING THERE: " +
        plan.transport.gettingThere.map((g, i) => `${i}:${g.mode} ${g.costPerPersonRoundTrip}${currency}pp`).join("; ") +
        ` (recommended ${plan.transport.recommended})`,
    );
  }
  return L.join("\n");
}

export function buildChatContext({ trip, live, plan, totals }) {
  const parts = [];
  if (trip) parts.push(tripBlock(trip));
  if (live) parts.push(liveBlock(live, { short: true }));
  if (plan) parts.push(`CURRENT PLAN:\n${compactPlan(plan, trip?.currency ?? "")}`);
  if (totals) parts.push(`ESTIMATED TOTAL (incl. 10% buffer): ${totals.total} ${trip?.currency ?? ""} vs budget ${trip?.budget ?? "?"}`);
  return parts.join("\n\n");
}
