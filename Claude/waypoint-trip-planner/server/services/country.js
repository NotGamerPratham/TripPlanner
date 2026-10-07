// Country facts (Wikidata), public holidays (Nager.Date), exchange rates
// (Frankfurter / ECB), optional live events (Ticketmaster Discovery) and a
// clearly-labelled crowd *estimate* (no free live crowd feed exists).
import { fetchJSON, isoDateAddDays } from "../lib/http.js";
import { cached, HOUR } from "../lib/cache.js";

export async function countryFacts(cc) {
  const code = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("bad country code");
  return cached(`wd:${code}`, 24 * HOUR, async () => {
    const query = `
SELECT ?countryLabel ?currencyCode ?callingCode ?drivingSideLabel ?emergencyLabel ?emergencyUseLabel
       (GROUP_CONCAT(DISTINCT ?langLabel; separator=", ") AS ?langs) WHERE {
  ?country wdt:P297 "${code}" .
  OPTIONAL { ?country p:P38 ?cs . ?cs ps:P38 ?currency . FILTER NOT EXISTS { ?cs pq:P582 ?end }
             ?currency wdt:P498 ?currencyCode . }
  OPTIONAL { ?country wdt:P474 ?callingCode . }
  OPTIONAL { ?country wdt:P1622 ?drivingSide . }
  OPTIONAL { ?country p:P2852 ?es . ?es ps:P2852 ?emergency . OPTIONAL { ?es pq:P366 ?emergencyUse . } }
  OPTIONAL { ?country wdt:P37 ?lang . ?lang rdfs:label ?langLabel . FILTER(LANG(?langLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?countryLabel ?currencyCode ?callingCode ?drivingSideLabel ?emergencyLabel ?emergencyUseLabel
LIMIT 60`;
    const url = new URL("https://query.wikidata.org/sparql");
    url.search = new URLSearchParams({ query, format: "json" });
    const d = await fetchJSON(url, { headers: { Accept: "application/sparql-results+json" }, timeoutMs: 20_000 });
    const rows = d.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
    if (!rows.length) return null;
    const uniq = (xs) => [...new Set(xs.filter(Boolean))];
    const emergency = [];
    for (const r of rows) {
      if (!r.emergencyLabel || !/^[\d\s+*#-]{2,15}$/.test(r.emergencyLabel)) continue;
      const use = r.emergencyUseLabel && !/^Q\d+$/.test(r.emergencyUseLabel) ? r.emergencyUseLabel : null;
      if (!emergency.some((e) => e.number === r.emergencyLabel && e.use === use)) {
        emergency.push({ number: r.emergencyLabel, use });
      }
    }
    return {
      name: rows[0].countryLabel,
      currencies: uniq(rows.map((r) => r.currencyCode)),
      callingCode: uniq(rows.map((r) => r.callingCode))[0] ?? null,
      drivingSide: uniq(rows.map((r) => r.drivingSideLabel))[0] ?? null,
      languages: uniq(rows.flatMap((r) => (r.langs ? r.langs.split(", ") : []))).slice(0, 5),
      emergency: emergency.slice(0, 8),
      source: "Wikidata",
    };
  });
}

export async function publicHolidays(cc, year) {
  return cached(`hol:${cc}:${year}`, 24 * HOUR, async () => {
    const d = await fetchJSON(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc.toUpperCase()}`);
    return (d ?? []).map((h) => ({
      date: h.date,
      name: h.name,
      localName: h.localName,
      national: h.global !== false,
      types: h.types ?? [],
    }));
  });
}

export async function fxRate(from, to) {
  if (from === to) return { rate: 1, date: null, source: "same currency" };
  return cached(`fx:${from}:${to}`, 6 * HOUR, async () => {
    const d = await fetchJSON(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`);
    const rate = d?.rates?.[to];
    if (!rate) throw new Error(`No ECB rate for ${from}→${to}`);
    return { rate, date: d.date, source: "Frankfurter (European Central Bank reference rates)" };
  });
}

export async function ticketmasterEvents(lat, lon, startDate, days) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return null; // not configured → caller reports "unavailable"
  const end = isoDateAddDays(startDate, days);
  return cached(`tm:${lat.toFixed(2)}:${lon.toFixed(2)}:${startDate}:${days}`, 2 * HOUR, async () => {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.search = new URLSearchParams({
      apikey: key,
      latlong: `${lat},${lon}`,
      radius: "30",
      unit: "km",
      startDateTime: `${startDate}T00:00:00Z`,
      endDateTime: `${end}T00:00:00Z`,
      size: "20",
      sort: "date,asc",
    });
    const d = await fetchJSON(url);
    return (d?._embedded?.events ?? []).map((e) => ({
      name: e.name,
      date: e.dates?.start?.localDate ?? null,
      time: e.dates?.start?.localTime ?? null,
      venue: e._embedded?.venues?.[0]?.name ?? null,
      category: e.classifications?.[0]?.segment?.name ?? null,
      url: e.url ?? null,
    }));
  });
}

// Countries whose weekend is Friday–Saturday (affects crowd heuristics).
const FRI_SAT_WEEKEND = new Set(["IL", "SA", "EG", "KW", "QA", "BH", "OM", "JO", "DZ", "IQ", "SY", "LY", "SD", "YE", "BD", "MV"]);

/**
 * Heuristic crowd estimate — explicitly NOT live data. Based on weekday,
 * local public holidays and (for "now") the local hour.
 */
export function crowdEstimate({ countryCode, tripDates, holidays, localNow }) {
  const friSat = FRI_SAT_WEEKEND.has((countryCode ?? "").toUpperCase());
  const isWeekend = (dow) => (friSat ? dow === 5 || dow === 6 : dow === 0 || dow === 6);
  const holidayOn = (date) => holidays.find((h) => h.date === date);

  const days = tripDates.map((date) => {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const reasons = [];
    let score = 1;
    if (isWeekend(dow)) {
      score += 1;
      reasons.push("weekend");
    }
    const hol = holidayOn(date);
    if (hol) {
      score += 2;
      reasons.push(`public holiday: ${hol.name}`);
    }
    const level = score >= 3 ? "high" : score === 2 ? "moderate" : "low";
    return { date, level, reasons: reasons.length ? reasons : ["regular weekday"] };
  });

  let now = null;
  if (localNow) {
    const [datePart, timePart] = localNow.split("T");
    const hour = Number(timePart?.slice(0, 2));
    const dow = new Date(`${datePart}T12:00:00Z`).getUTCDay();
    const reasons = [];
    let score = 0;
    if (hour >= 10 && hour < 18) {
      score += 1;
      reasons.push("peak sightseeing hours");
    } else if (hour >= 22 || hour < 7) reasons.push("night-time");
    if (isWeekend(dow)) {
      score += 1;
      reasons.push("weekend");
    }
    const hol = holidayOn(datePart);
    if (hol) {
      score += 1;
      reasons.push(`public holiday: ${hol.name}`);
    }
    now = { level: score >= 2 ? "high" : score === 1 ? "moderate" : "low", reasons };
  }

  return {
    days,
    now,
    method: "Heuristic estimate from weekday, local public holidays and time of day — no live crowd feed.",
  };
}
