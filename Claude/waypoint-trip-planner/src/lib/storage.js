// localStorage is a per-browser convenience (saved trips, packing ticks).
// Every access is guarded: private mode or blocked storage must not break the app.
import { SavedTripSchema } from "../../shared/schema.js";

const TRIPS_KEY = "waypoint:trips:v1";

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listTrips() {
  const raw = readJSON(TRIPS_KEY, []);
  return Array.isArray(raw) ? raw.filter((t) => SavedTripSchema.safeParse(t).success) : [];
}

export function saveTrip(trip) {
  const trips = listTrips().filter((t) => t.id !== trip.id);
  trips.unshift(trip);
  return writeJSON(TRIPS_KEY, trips.slice(0, 20));
}

export function deleteTrip(id) {
  return writeJSON(
    TRIPS_KEY,
    listTrips().filter((t) => t.id !== id),
  );
}
