// Aggregates every live source for a trip into one snapshot. Never throws:
// each source reports its own status so the UI (and Claude) can say exactly
// what is known and what is unavailable.
import { forecast, airQuality, lastYear } from "../services/openmeteo.js";
import { deriveWeatherAlerts, usgsQuakes, gdacsEvents, nwsAlerts } from "../services/alerts.js";
import { countryFacts, publicHolidays, fxRate, ticketmasterEvents, crowdEstimate } from "../services/country.js";
import { isoDateAddDays } from "./http.js";

function localNowIn(timeZone) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return new Date().toISOString().slice(0, 16);
  }
}

const value = (r) => (r.status === "fulfilled" ? r.value : null);
const why = (r) => (r.status === "rejected" ? r.reason?.message ?? "failed" : null);

export async function getLiveSnapshot({ lat, lon, countryCode, countryName, timezone, startDate, days, currency }) {
  const tripDates = Array.from({ length: days }, (_, i) => isoDateAddDays(startDate, i));
  const years = [...new Set(tripDates.map((d) => d.slice(0, 4)))];
  const todayUtc = new Date().toISOString().slice(0, 10);
  const cc = countryCode?.toUpperCase() ?? null;

  const [wx, aq, ly, facts, hol, quakes, gdacs, nws, events] = await Promise.allSettled([
    forecast(lat, lon),
    airQuality(lat, lon),
    lastYear(lat, lon, startDate, days),
    cc ? countryFacts(cc) : Promise.reject(new Error("no country code")),
    cc ? Promise.all(years.map((y) => publicHolidays(cc, y))).then((a) => a.flat()) : Promise.reject(new Error("no country code")),
    usgsQuakes(lat, lon, todayUtc),
    gdacsEvents(lat, lon, countryName),
    cc === "US" ? nwsAlerts(lat, lon) : Promise.resolve(null),
    ticketmasterEvents(lat, lon, startDate, days),
  ]);

  const weather = value(wx);
  const tz = weather?.timezone ?? timezone ?? "UTC";
  const localNow = localNowIn(tz);
  const today = localNow.slice(0, 10);
  const holidays = value(hol) ?? [];
  const country = value(facts);
  const localCurrency = country?.currencies?.[0] ?? null;

  let fx = null;
  let fxErr = null;
  if (localCurrency && currency) {
    try {
      fx = { from: currency, to: localCurrency, ...(await fxRate(currency, localCurrency)) };
    } catch (err) {
      fxErr = err.message;
    }
  }

  const tripForecast = tripDates.map((d) => weather?.daily.find((x) => x.date === d) ?? null);
  const covered = tripForecast.filter(Boolean).length;

  const sources = [
    { id: "weather", name: "Open-Meteo forecast", status: weather ? "ok" : "unavailable", detail: why(wx) },
    { id: "air", name: "Open-Meteo air quality", status: value(aq) ? "ok" : "unavailable", detail: why(aq) },
    { id: "history", name: "Open-Meteo historical (last year)", status: value(ly) ? "ok" : "unavailable", detail: why(ly) },
    { id: "country", name: "Wikidata country facts", status: country ? "ok" : "unavailable", detail: why(facts) },
    { id: "holidays", name: "Nager.Date public holidays", status: hol.status === "fulfilled" ? "ok" : "unavailable", detail: why(hol) },
    { id: "fx", name: "Frankfurter exchange rates", status: fx ? "ok" : "unavailable", detail: fxErr ?? (localCurrency ? null : "local currency unknown") },
    { id: "quakes", name: "USGS earthquakes", status: quakes.status === "fulfilled" ? "ok" : "unavailable", detail: why(quakes) },
    { id: "gdacs", name: "GDACS disaster alerts", status: gdacs.status === "fulfilled" ? "ok" : "unavailable", detail: why(gdacs) },
    {
      id: "nws",
      name: "US National Weather Service alerts",
      status: cc !== "US" ? "n/a" : nws.status === "fulfilled" ? "ok" : "unavailable",
      detail: cc !== "US" ? "US destinations only" : why(nws),
    },
    {
      id: "events",
      name: "Ticketmaster events",
      status: events.status === "rejected" ? "unavailable" : value(events) === null ? "not-configured" : "ok",
      detail: events.status === "rejected" ? why(events) : value(events) === null ? "Set TICKETMASTER_API_KEY to enable live events" : null,
    },
    { id: "crowd", name: "Crowd level", status: "estimate", detail: "Heuristic — no free live crowd feed exists" },
    { id: "closures", name: "Closures & strikes", status: "unavailable", detail: "No open global feed — verify on official sites" },
  ];

  return {
    place: { lat, lon, countryCode: cc, countryName: countryName ?? country?.name ?? null, timezone: tz },
    localNow,
    today,
    tripDates,
    weather,
    tripForecast,
    forecastCoverage: { covered, total: days, lastForecastDate: weather?.daily.at(-1)?.date ?? null },
    airQuality: value(aq),
    lastYear: value(ly),
    alerts: {
      weather: weather ? deriveWeatherAlerts(weather.daily, tripDates) : [],
      quakes: value(quakes) ?? [],
      disasters: value(gdacs) ?? [],
      nws: value(nws) ?? [],
    },
    holidays: {
      inTrip: holidays.filter((h) => tripDates.includes(h.date)),
      upcoming: holidays.filter((h) => h.date >= today && h.date <= isoDateAddDays(today, 45)).slice(0, 4),
    },
    events: value(events),
    crowd: crowdEstimate({ countryCode: cc, tripDates, holidays, localNow }),
    country,
    fx,
    sources,
    generatedAt: new Date().toISOString(),
  };
}
