export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const hasCoords = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);
export { hasCoords };

/** Rough door-to-door estimate when no routed time is available yet. */
export function estimateTravel(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const km = distanceKm(a.lat, a.lon, b.lat, b.lon) * 1.3; // street-network detour factor
  if (km <= 1.6) return { minutes: Math.max(3, Math.round((km / 4.5) * 60)), mode: "walk" };
  if (km <= 12) return { minutes: Math.round((km / 18) * 60 + 8), mode: "transit" };
  return { minutes: Math.round((km / 50) * 60 + 15), mode: "car" }; // regional train / road
}

/** Walking for compact days, road routing when any hop is a long one. */
export function routeProfile(points) {
  let total = 0;
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    const leg = distanceKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    total += leg;
    longest = Math.max(longest, leg);
  }
  return total <= 6 && longest <= 2.5 ? "foot" : "car";
}
