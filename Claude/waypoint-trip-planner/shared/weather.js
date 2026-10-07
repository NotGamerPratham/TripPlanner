// WMO weather interpretation codes (as used by Open-Meteo).
export const WMO = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, hail",
  99: "Severe thunderstorm",
};

export const wmoLabel = (code) => WMO[code] ?? "Unknown";

/** Coarse category for icons and planning logic. */
export function wmoKind(code) {
  if (code == null) return "unknown";
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51) return "rain";
  return "cloudy";
}

/** 0 (dry & clear) … 1 (washout) — used to match outdoor days to dry dates. */
export function wetness(day) {
  if (!day) return 0.5;
  const prob = (day.precipProb ?? 50) / 100;
  const amount = Math.min((day.precip ?? 0) / 15, 1);
  const storm = day.code >= 95 ? 0.3 : 0;
  return Math.min(1, prob * 0.6 + amount * 0.4 + storm);
}
