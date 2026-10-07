// Real travel times between stops via OSRM (FOSSGIS public instance by
// default — fine for development; self-host or set ROUTING_URL for production).
import { fetchJSON } from "../lib/http.js";
import { cached, HOUR } from "../lib/cache.js";

const BASE = process.env.ROUTING_URL || "https://routing.openstreetmap.de";
const PROFILES = { foot: "routed-foot", car: "routed-car", bike: "routed-bike" };

export async function route(profile, coords) {
  const service = PROFILES[profile];
  if (!service) throw new Error("unknown profile");
  const path = coords.map(([lat, lon]) => `${lon.toFixed(5)},${lat.toFixed(5)}`).join(";");
  return cached(`route:${profile}:${path}`, 12 * HOUR, async () => {
    const d = await fetchJSON(`${BASE}/${service}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`, {
      timeoutMs: 15_000,
    });
    if (d?.code !== "Ok" || !d.routes?.length) throw new Error(`routing failed: ${d?.code ?? "no route"}`);
    const r = d.routes[0];
    return {
      profile,
      geometry: r.geometry.coordinates.map(([lon, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]),
      legs: r.legs.map((l) => ({ durationMin: Math.max(1, Math.round(l.duration / 60)), distanceKm: Math.round(l.distance / 100) / 10 })),
      distanceKm: Math.round(r.distance / 100) / 10,
      durationMin: Math.round(r.duration / 60),
      source: "OSRM routing on OpenStreetMap data",
    };
  });
}
