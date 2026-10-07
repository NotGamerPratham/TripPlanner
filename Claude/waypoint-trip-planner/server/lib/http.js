// Small fetch wrapper for upstream open-data APIs: timeouts, a polite
// User-Agent (OSM/Overpass/NWS policies ask for one) and typed errors.

const CONTACT = process.env.CONTACT_EMAIL ? ` (${process.env.CONTACT_EMAIL})` : "";
export const USER_AGENT = `WaypointTripPlanner/1.0${CONTACT}`;

export class UpstreamError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.url = url;
  }
}

export async function fetchJSON(url, { timeoutMs = 12_000, headers = {}, method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      body,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "timed out" : "network error";
    throw new UpstreamError(`${new URL(url).host} ${reason}`, { url });
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    throw new UpstreamError(`${new URL(url).host} responded ${res.status}`, { status: res.status, url });
  }
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(`${new URL(url).host} returned invalid JSON`, { status: res.status, url });
  }
}

/** Haversine distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isoDateAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
