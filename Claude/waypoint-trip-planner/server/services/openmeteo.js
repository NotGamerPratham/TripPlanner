// Open-Meteo: geocoding, 16-day forecast, air quality, and last year's
// observed weather for the same dates (historical context, not a forecast).
import { fetchJSON, isoDateAddDays } from "../lib/http.js";
import { cached, HOUR, MINUTE } from "../lib/cache.js";

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export async function geocode(query, count = 6) {
  const q = query.trim();
  return cached(`geo:${q.toLowerCase()}:${count}`, 24 * HOUR, async () => {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({ name: q, count: String(count), language: "en", format: "json" });
    const data = await fetchJSON(url);
    return (data?.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      admin1: r.admin1 ?? null,
      country: r.country ?? null,
      countryCode: r.country_code ?? null,
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone ?? null,
      population: r.population ?? null,
    }));
  });
}

export async function forecast(lat, lon) {
  return cached(`wx:${round(lat)}:${round(lon)}`, 20 * MINUTE, async () => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: [
        "temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation",
        "weather_code", "wind_speed_10m", "wind_gusts_10m", "is_day", "cloud_cover",
      ].join(","),
      hourly: "temperature_2m,precipitation_probability,weather_code",
      forecast_hours: "24",
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
        "precipitation_probability_max", "sunrise", "sunset", "daylight_duration",
        "uv_index_max", "wind_speed_10m_max", "wind_gusts_10m_max",
      ].join(","),
      forecast_days: "16",
      timezone: "auto",
    });
    const d = await fetchJSON(url);
    // The 16th day is sometimes only partially populated — drop empty days.
    const daily = d.daily.time
      .map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      tMax: d.daily.temperature_2m_max[i],
      tMin: d.daily.temperature_2m_min[i],
      precip: d.daily.precipitation_sum[i],
      precipProb: d.daily.precipitation_probability_max[i],
      sunrise: d.daily.sunrise[i],
      sunset: d.daily.sunset[i],
      daylightSec: d.daily.daylight_duration[i],
      uv: d.daily.uv_index_max[i],
      windMax: d.daily.wind_speed_10m_max[i],
      gustMax: d.daily.wind_gusts_10m_max[i],
      }))
      .filter((day) => day.tMax != null && day.tMin != null);
    const hourly = d.hourly.time.map((time, i) => ({
      time,
      temp: d.hourly.temperature_2m[i],
      precipProb: d.hourly.precipitation_probability[i],
      code: d.hourly.weather_code[i],
    }));
    return {
      timezone: d.timezone,
      utcOffsetSec: d.utc_offset_seconds,
      current: {
        time: d.current.time,
        temp: d.current.temperature_2m,
        feelsLike: d.current.apparent_temperature,
        humidity: d.current.relative_humidity_2m,
        precip: d.current.precipitation,
        code: d.current.weather_code,
        wind: d.current.wind_speed_10m,
        gust: d.current.wind_gusts_10m,
        isDay: d.current.is_day === 1,
        cloud: d.current.cloud_cover,
      },
      hourly,
      daily,
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function airQuality(lat, lon) {
  return cached(`aq:${round(lat)}:${round(lon)}`, 30 * MINUTE, async () => {
    const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "us_aqi,pm2_5",
      timezone: "auto",
    });
    const d = await fetchJSON(url);
    return { usAqi: d.current?.us_aqi ?? null, pm25: d.current?.pm2_5 ?? null, time: d.current?.time ?? null };
  });
}

/** Observed weather on the same calendar dates one year earlier. */
export async function lastYear(lat, lon, startDate, days) {
  const start = `${Number(startDate.slice(0, 4)) - 1}${startDate.slice(4)}`;
  // Feb 29 → Feb 28 in a non-leap year
  const safeStart = start.endsWith("-02-29") ? start.replace("-02-29", "-02-28") : start;
  const end = isoDateAddDays(safeStart, days - 1);
  return cached(`ly:${round(lat)}:${round(lon)}:${safeStart}:${days}`, 24 * HOUR, async () => {
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: safeStart,
      end_date: end,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "auto",
    });
    const d = await fetchJSON(url);
    return d.daily.time.map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      tMax: d.daily.temperature_2m_max[i],
      tMin: d.daily.temperature_2m_min[i],
      precip: d.daily.precipitation_sum[i],
    }));
  });
}
