// Safety & disruption signals from real sources only:
//  - weather warnings derived from the Open-Meteo forecast numbers
//  - USGS earthquakes (M4+, 300 km, last 7 days)
//  - GDACS current global disaster events near the destination
//  - US National Weather Service active alerts (US destinations only)
import { fetchJSON, distanceKm, isoDateAddDays } from "../lib/http.js";
import { cached, MINUTE } from "../lib/cache.js";

const THUNDER = new Set([95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);

export function deriveWeatherAlerts(daily, tripDates) {
  const inTrip = new Set(tripDates);
  const out = [];
  for (const d of daily) {
    const scope = inTrip.has(d.date) ? "trip" : "outside";
    const push = (severity, title, detail) =>
      out.push({ date: d.date, severity, title, detail, scope, source: "Derived from Open-Meteo forecast" });
    if (THUNDER.has(d.code)) push("high", "Thunderstorms forecast", `Weather code ${d.code}; keep outdoor plans flexible.`);
    if ((d.precipProb ?? 0) >= 70 && (d.precip ?? 0) >= 10)
      push("medium", "Heavy rain likely", `${d.precipProb}% chance, ~${d.precip} mm expected.`);
    if ((d.tMax ?? 0) >= 35) push("high", "Extreme heat", `High of ${d.tMax}°C — avoid midday exertion, hydrate.`);
    if ((d.tMin ?? 0) <= -10) push("medium", "Severe cold", `Low of ${d.tMin}°C.`);
    if ((d.uv ?? 0) >= 8) push("low", "Very high UV", `UV index up to ${d.uv}.`);
    if ((d.gustMax ?? 0) >= 60) push("medium", "Strong wind gusts", `Gusts up to ${d.gustMax} km/h.`);
    if (SNOW.has(d.code)) push("low", "Snow forecast", "Check road and trail conditions.");
  }
  return out;
}

export async function usgsQuakes(lat, lon, today) {
  return cached(`usgs:${lat.toFixed(1)}:${lon.toFixed(1)}:${today}`, 30 * MINUTE, async () => {
    const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
    url.search = new URLSearchParams({
      format: "geojson",
      latitude: String(lat),
      longitude: String(lon),
      maxradiuskm: "300",
      minmagnitude: "4",
      starttime: isoDateAddDays(today, -7),
      orderby: "time",
      limit: "10",
    });
    const d = await fetchJSON(url);
    return (d.features ?? []).map((f) => ({
      title: f.properties.title,
      magnitude: f.properties.mag,
      time: new Date(f.properties.time).toISOString(),
      url: f.properties.url,
      distanceKm: Math.round(distanceKm(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])),
    }));
  });
}

export async function gdacsEvents(lat, lon, countryName) {
  const all = await cached("gdacs:current", 30 * MINUTE, async () => {
    const d = await fetchJSON("https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP", {
      timeoutMs: 15_000,
    });
    return (d.features ?? []).map((f) => ({
      type: f.properties.eventtype,
      name: f.properties.name,
      alertLevel: f.properties.alertlevel,
      country: f.properties.country ?? "",
      from: f.properties.fromdate,
      to: f.properties.todate,
      url: f.properties.url?.report ?? null,
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
    }));
  });
  const country = (countryName ?? "").toLowerCase();
  return all
    .map((e) => ({
      ...e,
      distanceKm: Number.isFinite(e.lat) ? Math.round(distanceKm(lat, lon, e.lat, e.lon)) : null,
    }))
    .filter((e) => (e.distanceKm != null && e.distanceKm <= 600) || (country && e.country.toLowerCase().includes(country)))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
    .slice(0, 8);
}

export async function nwsAlerts(lat, lon) {
  return cached(`nws:${lat.toFixed(2)}:${lon.toFixed(2)}`, 10 * MINUTE, async () => {
    const d = await fetchJSON(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { Accept: "application/geo+json" },
    });
    return (d.features ?? []).slice(0, 8).map((f) => ({
      event: f.properties.event,
      headline: f.properties.headline,
      severity: f.properties.severity,
      effective: f.properties.effective,
      expires: f.properties.expires,
    }));
  });
}
