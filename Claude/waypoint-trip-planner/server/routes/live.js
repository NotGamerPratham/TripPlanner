// Live, key-free data endpoints. All inputs are validated; upstream failures
// are reported as data ("unavailable"), never papered over.
import { Router } from "express";
import { z } from "zod";
import { geocode } from "../services/openmeteo.js";
import { nearbyPlaces } from "../services/places.js";
import { route } from "../services/routing.js";
import { getLiveSnapshot } from "../lib/live.js";
import { CURRENCIES } from "../../shared/schema.js";

export const liveRouter = Router();

const lat = z.coerce.number().min(-90).max(90);
const lon = z.coerce.number().min(-180).max(180);

function parse(schema, input, res) {
  const r = schema.safeParse(input);
  if (!r.success) {
    res.status(400).json({ error: "Invalid parameters", issues: r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) });
    return null;
  }
  return r.data;
}

liveRouter.get("/geocode", async (req, res, next) => {
  const q = parse(z.object({ q: z.string().trim().min(2).max(80) }), req.query, res);
  if (!q) return;
  try {
    res.json({ results: await geocode(q.q) });
  } catch (err) {
    next(err);
  }
});

const LiveQuery = z.object({
  lat,
  lon,
  cc: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  country: z.string().max(80).optional(),
  tz: z.string().max(64).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(1).max(14),
  currency: z.enum(CURRENCIES),
});

liveRouter.get("/live", async (req, res, next) => {
  const q = parse(LiveQuery, req.query, res);
  if (!q) return;
  try {
    res.json(
      await getLiveSnapshot({
        lat: q.lat,
        lon: q.lon,
        countryCode: q.cc,
        countryName: q.country,
        timezone: q.tz,
        startDate: q.start,
        days: q.days,
        currency: q.currency,
      }),
    );
  } catch (err) {
    next(err);
  }
});

liveRouter.get("/places", async (req, res, next) => {
  const q = parse(z.object({ lat, lon }), req.query, res);
  if (!q) return;
  try {
    res.json(await nearbyPlaces(q.lat, q.lon));
  } catch (err) {
    next(err);
  }
});

const RouteQuery = z.object({
  profile: z.enum(["foot", "car", "bike"]),
  coords: z
    .string()
    .max(600)
    .transform((s) => s.split(";").map((pair) => pair.split(",").map(Number)))
    .pipe(z.array(z.tuple([lat, lon])).min(2).max(12)),
});

liveRouter.get("/route", async (req, res, next) => {
  const q = parse(RouteQuery, req.query, res);
  if (!q) return;
  try {
    res.json(await route(q.profile, q.coords));
  } catch (err) {
    next(err);
  }
});
