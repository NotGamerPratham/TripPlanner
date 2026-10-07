// Real places around the destination, in three rings:
//   nearby ≤5 km · day trips 5–25 km · hidden gems 25–100 km
// Sights come from Wikipedia GeoSearch (fast, reliable, with short
// descriptions); stays and eateries come from OpenStreetMap via Overpass.
// Each source reports its own status — nothing is invented when one fails.
import { fetchJSON, distanceKm, UpstreamError, USER_AGENT } from "../lib/http.js";
import { cached, HOUR } from "../lib/cache.js";

/* ------------------------------- Wikipedia ------------------------------- */

const EXCLUDE =
  /\b(station|university|school|college|academy|company|corporation|hospital|clinic|office|ward|district|neighbou?rhood|village|town|city|municipality|prefecture|county|province|road|street|highway|expressway|motorway|railway|line|airport|stadium|arena|power|plant|factory|cemetery|hotel|restaurant|defunct|demolished|former|closed|bus|tram|interchange|junction|tunnel|dam|reservoir|hall of|apartment|skyscraper|office building)\b/i;
const SIGHT =
  /\b(temple|shrine|museum|park|garden|castle|church|cathedral|basilica|mosque|synagogue|palace|market|falls|waterfall|lake|beach|tower|monument|memorial|gallery|zoo|aquarium|gorge|canyon|cave|hot spring|onsen|island|mountain|peak|volcano|viewpoint|observation|ruins|archaeological|fort|fortress|villa|square|plaza|historic|heritage|monastery|abbey|national park|nature reserve|botanical|theatre|theater|opera|bazaar|old town|quarter|pagoda|stupa|mausoleum|tomb|lighthouse|bay|cliff|valley|forest|hill|spring|bridge)\b/i;
const NATURE_TYPES = new Set(["mountain", "waterbody", "forest", "isle", "glacier", "pass"]);

function kindOf(description = "", coordType = "") {
  const d = description.toLowerCase();
  if (
    NATURE_TYPES.has(coordType) ||
    /falls|waterfall|lake|beach|mountain|peak|volcano|gorge|canyon|cave|hot spring|onsen|island|national park|nature reserve|bay|cliff|valley|forest|hill|spring/.test(
      d,
    )
  )
    return "nature";
  if (/museum|gallery/.test(d)) return "museum";
  if (/park|garden|botanical/.test(d)) return "park";
  if (/market|bazaar/.test(d)) return "market";
  if (/zoo|aquarium/.test(d)) return "family";
  if (/tower|viewpoint|observation|lighthouse/.test(d)) return "viewpoint";
  if (/temple|shrine|church|cathedral|basilica|mosque|synagogue|monastery|abbey|pagoda|stupa/.test(d)) return "religious";
  if (/castle|palace|fort|ruins|archaeolog|monument|memorial|historic|heritage|mausoleum|tomb/.test(d)) return "historic";
  if (/theatre|theater|opera/.test(d)) return "culture";
  return "attraction";
}

function destinationPoint(lat, lon, bearingDeg, km) {
  const R = 6371;
  const δ = km / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

async function geosearch(lat, lon, limit) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    generator: "geosearch",
    ggscoord: `${lat.toFixed(5)}|${lon.toFixed(5)}`,
    ggsradius: "10000",
    ggslimit: String(limit),
    prop: "coordinates|description",
    coprop: "type",
    colimit: "max",
    format: "json",
    formatversion: "2",
  });
  const d = await fetchJSON(url, { timeoutMs: 12_000 });
  return d?.query?.pages ?? [];
}

async function pool(tasks, concurrency) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]().catch(() => []);
    }
  });
  await Promise.all(workers);
  return results;
}

async function wikipediaSights(lat, lon) {
  const points = [
    { lat, lon, limit: 300 },
    ...[0, 60, 120, 180, 240, 300].map((b) => {
      const [pLat, pLon] = destinationPoint(lat, lon, b, 17);
      return { lat: pLat, lon: pLon, limit: 120 };
    }),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((b) => {
      const [pLat, pLon] = destinationPoint(lat, lon, b + 22, 60);
      return { lat: pLat, lon: pLon, limit: 120 };
    }),
  ];
  const batches = await pool(
    points.map((p) => () => geosearch(p.lat, p.lon, p.limit)),
    4,
  );
  if (!batches[0]?.length && batches.every((b) => !b?.length)) throw new UpstreamError("Wikipedia GeoSearch returned nothing");

  const seen = new Set();
  const out = [];
  for (const page of batches.flat()) {
    if (!page?.coordinates?.[0] || seen.has(page.pageid)) continue;
    seen.add(page.pageid);
    const c = page.coordinates[0];
    const description = page.description ?? "";
    const natural = NATURE_TYPES.has(c.type);
    const looksLikeSight = natural || ((c.type === "landmark" || SIGHT.test(description)) && !EXCLUDE.test(description));
    if (!looksLikeSight || (!SIGHT.test(`${description} ${page.title}`) && !natural)) continue;
    out.push({
      id: `wp${page.pageid}`,
      name: page.title.slice(0, 100),
      description: description.slice(0, 140),
      lat: c.lat,
      lon: c.lon,
      distKm: Math.round(distanceKm(lat, lon, c.lat, c.lon) * 10) / 10,
      kind: kindOf(description, c.type),
      url: `https://en.wikipedia.org/?curid=${page.pageid}`,
      source: "wikipedia",
      tags: {},
    });
  }
  return out;
}

/* -------------------------------- Overpass ------------------------------- */

const MIRRORS = [
  process.env.OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].filter(Boolean);

async function overpass(query, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let lastErr;
  for (const url of MIRRORS) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(Math.min(remaining, 9_000)),
      });
      if (!res.ok) throw new UpstreamError(`${new URL(url).host} responded ${res.status}`);
      const json = await res.json();
      return json.elements ?? [];
    } catch (err) {
      lastErr = err.name === "TimeoutError" ? new UpstreamError(`${new URL(url).host} timed out`) : err;
    }
  }
  throw lastErr ?? new UpstreamError("all Overpass servers busy");
}

function normalizeOsm(el, lat, lon) {
  const t = el.tags ?? {};
  const name = t["name:en"] || t.name;
  const pLat = el.lat ?? el.center?.lat;
  const pLon = el.lon ?? el.center?.lon;
  if (!name || !Number.isFinite(pLat) || !Number.isFinite(pLon)) return null;
  return {
    id: `${el.type === "node" ? "n" : "o"}${el.id}`,
    name: name.slice(0, 100),
    localName: t["name:en"] && t.name && t.name !== t["name:en"] ? t.name.slice(0, 100) : null,
    lat: pLat,
    lon: pLon,
    distKm: Math.round(distanceKm(lat, lon, pLat, pLon) * 10) / 10,
    kind: t.tourism ?? t.amenity ?? "place",
    url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    source: "osm",
    tags: {
      cuisine: t.cuisine,
      stars: t.stars,
      opening_hours: t.opening_hours,
      website: t.website || t["contact:website"],
      vegetarian: t["diet:vegetarian"],
      vegan: t["diet:vegan"],
      halal: t["diet:halal"],
      wheelchair: t.wheelchair,
    },
  };
}

// Public Overpass servers are often saturated; remember a failure briefly so
// the planner doesn't wait on them again for every request.
const osmFailures = new Map(); // key -> { until, message }

async function osmStaysAndEats(lat, lon) {
  const key = `${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const failed = osmFailures.get(key);
  if (failed && failed.until > Date.now()) throw new UpstreamError(failed.message);
  const at = (r) => `(around:${r},${lat},${lon})`;
  const query = `[out:json][timeout:15];
nw["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]["name"]${at(3000)};
out tags center 80;
nw["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"]${at(1500)};
out tags center 120;`;
  let elements;
  try {
    elements = await overpass(query, 20_000);
  } catch (err) {
    osmFailures.set(key, { until: Date.now() + 3 * 60_000, message: `Overpass busy: ${err.message}` });
    throw err;
  }
  const places = elements.map((e) => normalizeOsm(e, lat, lon)).filter(Boolean);
  const score = (p) => (p.tags.website ? 1 : 0) + (p.tags.opening_hours ? 1 : 0) + (p.tags.cuisine ? 1 : 0);
  const isStay = (p) => /^(hotel|hostel|guest_house|motel|apartment)$/.test(p.kind);
  return {
    stays: places
      .filter(isStay)
      .sort((a, b) => Number(b.tags.stars ?? 0) - Number(a.tags.stars ?? 0) || a.distKm - b.distKm)
      .slice(0, 40),
    eats: places
      .filter((p) => !isStay(p))
      .sort((a, b) => score(b) - score(a) || a.distKm - b.distKm)
      .slice(0, 50),
  };
}

/* ---------------------------------- API ---------------------------------- */

const GEM_PRIORITY = { nature: 3, historic: 2, viewpoint: 2, religious: 1 };

function dedupeByName(list) {
  const seen = new Set();
  return list.filter((p) => {
    const k = p.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function nearbyPlaces(lat, lon) {
  // Sources are cached separately so a temporary Overpass outage isn't
  // frozen into the cache alongside good Wikipedia results.
  const key = `${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const [sights, osm] = await Promise.allSettled([
    cached(`wp:${key}`, 6 * HOUR, () => wikipediaSights(lat, lon)),
    cached(`osm:${key}`, 6 * HOUR, () => osmStaysAndEats(lat, lon)),
  ]);
  if (sights.status === "rejected" && osm.status === "rejected") {
    throw new UpstreamError(`places unavailable (${sights.reason?.message}; ${osm.reason?.message})`);
  }
  const all = sights.status === "fulfilled" ? dedupeByName(sights.value) : [];
  const byDist = (a, b) => a.distKm - b.distKm;
  return {
    center: { lat, lon },
    rings: {
      nearby: all
        .filter((p) => p.distKm <= 5)
        .sort(byDist)
        .slice(0, 45),
      dayTrips: all
        .filter((p) => p.distKm > 5 && p.distKm <= 25)
        .sort(byDist)
        .slice(0, 30),
      hiddenGems: all
        .filter((p) => p.distKm > 25 && p.distKm <= 100)
        .sort((a, b) => (GEM_PRIORITY[b.kind] ?? 0) - (GEM_PRIORITY[a.kind] ?? 0) || byDist(a, b))
        .slice(0, 25),
    },
    stays: osm.status === "fulfilled" ? osm.value.stays : [],
    eats: osm.status === "fulfilled" ? osm.value.eats : [],
    status: {
      sights: sights.status === "fulfilled" ? "ok" : `unavailable (${sights.reason?.message})`,
      staysAndEats: osm.status === "fulfilled" ? "ok" : `unavailable (${osm.reason?.message})`,
    },
    sources: ["Wikipedia GeoSearch (CC BY-SA)", "© OpenStreetMap contributors (ODbL) via Overpass"],
    fetchedAt: new Date().toISOString(),
  };
}

/** Flat id → place index used to resolve Claude's placeId references. */
export function placeIndex(places) {
  const idx = new Map();
  if (!places) return idx;
  for (const list of [places.rings.nearby, places.rings.dayTrips, places.rings.hiddenGems, places.stays, places.eats]) {
    for (const p of list) idx.set(p.id, p);
  }
  return idx;
}
