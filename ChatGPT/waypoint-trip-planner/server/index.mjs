import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { validateItinerary, itineraryJsonSchema } from './validation.mjs';

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((x) => x.trim());
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null, true) : cb(new Error('Origin not allowed')) }));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/geocode', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).send('Missing q');
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'WaypointTripPlanner/1.0' } });
    if (!r.ok) return res.status(r.status).send('Geocoding unavailable');
    const data = await r.json();
    if (!data[0]) return res.status(404).send('Destination not found');
    res.json({ name: data[0].display_name.split(',').slice(0, 2).join(',').trim(), lat: Number(data[0].lat), lon: Number(data[0].lon), displayName: data[0].display_name });
  } catch (e) { res.status(500).send(e instanceof Error ? e.message : 'Geocoding failed'); }
});

app.get('/api/context', async (req, res) => {
  try {
    const lat = Number(req.query.lat); const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).send('Invalid coordinates');
    const destination = { name: String(req.query.destination || 'Destination'), lat, lon, displayName: String(req.query.destination || 'Destination'), timezone: String(req.query.timezone || 'auto') };
    const startDate = String(req.query.startDate || new Date().toISOString().slice(0, 10));
    const endDate = String(req.query.endDate || startDate);
    const [weather, nearby, events, closures, safety, crowd] = await Promise.all([
      fetchWeather(lat, lon, startDate, endDate),
      fetchNearby(lat, lon),
      fetchOptionalProvider(process.env.EVENTS_API_URL, process.env.EVENTS_API_KEY, { lat, lon, startDate, endDate, destination: destination.name, timezone: destination.timezone }),
      fetchOptionalProvider(process.env.CLOSURES_API_URL, process.env.CLOSURES_API_KEY, { lat, lon, startDate, endDate, destination: destination.name, timezone: destination.timezone }),
      fetchOptionalProvider(process.env.SAFETY_API_URL, process.env.SAFETY_API_KEY, { lat, lon, startDate, endDate, destination: destination.name, timezone: destination.timezone }),
      fetchOptionalProvider(process.env.CROWD_API_URL, process.env.CROWD_API_KEY, { lat, lon, startDate, endDate, destination: destination.name, timezone: destination.timezone })
    ]);
    res.json({ destination, weather, nearby, events: signal(events, 'optional-events'), closures: signal(closures, 'optional-closures'), safety: signal(safety, 'optional-safety'), crowd: signal(crowd, 'optional-crowd'), gatheredAt: new Date().toISOString() });
  } catch (e) { res.status(500).send(e instanceof Error ? e.message : 'Context fetch failed'); }
});

app.get('/api/route', async (req, res) => {
  try {
    const coordinates = String(req.query.coordinates || '').split(';').filter(Boolean);
    if (coordinates.length < 2 || coordinates.length > 25) return res.status(400).send('Need 2-25 coordinates');
    const r = await fetch(`${process.env.OSRM_URL || 'https://router.project-osrm.org'}/route/v1/driving/${coordinates.join(';')}?overview=full&geometries=geojson&steps=false`);
    if (!r.ok) return res.status(r.status).send('Routing unavailable');
    const data = await r.json();
    const route = data.routes?.[0];
    if (!route) return res.status(404).send('No route');
    res.json({ geometry: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]), durationSeconds: route.duration, distanceMeters: route.distance });
  } catch (e) { res.status(500).send(e instanceof Error ? e.message : 'Routing failed'); }
});

app.post('/api/plan/stream', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  try {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not configured on the server');
    const { input, context, mode = 'create', existingPlan } = req.body;
    write(res, { type: 'status', message: 'Live data assembled' });
    write(res, { type: 'status', message: 'Grounding Claude in source-backed signals' });

    const userContent = buildPrompt(input, context, mode, existingPlan);
    const stream = anthropic.messages.stream({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: itineraryJsonSchema } }
    });

    stream.on('text', (text) => {
      // The JSON is deliberately not rendered incrementally because partial JSON is not a valid UI state.
      // The validated sections are streamed to the browser immediately after Claude completes.
      if (text.length > 0) write(res, { type: 'status', message: 'Claude is writing structured sections' });
    });

    const finalMessage = await stream.finalMessage();
    const jsonText = finalMessage.content.find((block) => block.type === 'text')?.text;
    if (!jsonText) throw new Error('Claude returned no JSON text block');
    const parsed = JSON.parse(jsonText);
    const plan = validateItinerary(parsed);
    const enrichedPlan = await enrichTravelTimes(plan, context);

    write(res, { type: 'status', message: 'Validated schema. Streaming itinerary sections' });
    for (const key of ['title','summary','stays','days','transportPlan','moneySavingHacks','packingList','safetyTips','emergencyNumbers','sources']) {
      write(res, { type: 'section', section: key, payload: enrichedPlan[key] });
    }
    write(res, { type: 'complete', payload: enrichedPlan });
    res.end();
  } catch (e) {
    write(res, { type: 'error', message: e instanceof Error ? e.message : 'Planning failed' });
    res.end();
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not configured on the server');
    const prompt = `Answer the travel question using only the supplied plan and live context. If information is missing, say it is unavailable. Never invent prices, events, closures, safety alerts or emergency numbers. Question: ${req.body.question}\nPlan: ${JSON.stringify(req.body.plan)}\nLive context: ${JSON.stringify(req.body.context)}`;
    const message = await anthropic.messages.create({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 1200, system: 'You are a precise trip assistant grounded in the provided data.', messages: [{ role: 'user', content: prompt }] });
    const answer = message.content.find((x) => x.type === 'text')?.text || 'No answer returned.';
    res.json({ answer });
  } catch (e) { res.status(500).send(e instanceof Error ? e.message : 'Chat failed'); }
});

app.listen(port, () => console.log(`Waypoint server listening on http://localhost:${port}`));

const SYSTEM_PROMPT = `You are Waypoint, a senior destination planner. Build a practical itinerary from source data.

Hard rules:
1. Never invent facts. Any price, event, closure, safety alert, crowd level, hotel rate or emergency number not supported by the supplied data must be marked unknown or unavailable.
2. Use weather as a scheduling constraint. Prefer outdoor stops in lower-rain windows and indoor alternatives in higher-risk windows. Add Plan B for outdoor activities.
3. Cluster stops geographically and minimize backtracking.
4. Add 1-2 offbeat or less-obvious OSM places per day when the source data has them.
5. Match the traveler style, budget, food and transport preferences.
6. Keep total estimated spend within budget when possible, but never fake a price to do so.
7. Mark fee status verified only when a supplied source explicitly contains a fee. OSM names are not fee verification.
8. Stay tier is a categorization, not a price claim. Verified nightly rates are only allowed from a supplied hotel provider.
9. Emergency numbers must be verified from supplied context. Otherwise use status unknown.
10. Include the provided sources in the final sources list.`;

function buildPrompt(input, context, mode, existingPlan) {
  return `Create a trip plan.\nINPUT:\n${JSON.stringify(input)}\nLIVE CONTEXT:\n${JSON.stringify(context)}\nMODE: ${mode}\n${mode === 'cheaper' ? `EXISTING PLAN TO REDUCE COST WITHOUT LOWERING SAFETY:\n${JSON.stringify(existingPlan)}` : ''}\nReturn only the schema-constrained JSON.`;
}


async function enrichTravelTimes(plan, context) {
  const placeMap = new Map([...(context.nearby.r5km || []), ...(context.nearby.r25km || []), ...(context.nearby.r100km || [])].map((p) => [p.id, p]));
  const days = [];
  for (const day of plan.days) {
    const coords = [];
    for (const activity of day.activities) {
      const place = activity.placeId ? placeMap.get(activity.placeId) : null;
      if (place) coords.push([place.lon, place.lat]);
    }
    if (coords.length < 1) { days.push(day); continue; }
    const start = [context.destination.lon, context.destination.lat];
    const query = [start, ...coords].map(([lon, lat]) => `${lon},${lat}`).join(';');
    try {
      const r = await fetch(`${process.env.OSRM_URL || 'https://router.project-osrm.org'}/route/v1/driving/${query}?overview=false&steps=false`);
      if (!r.ok) throw new Error('route unavailable');
      const data = await r.json();
      const legs = data.routes?.[0]?.legs || [];
      const enriched = day.activities.map((activity, i) => ({
        ...activity,
        travelMinutesFromPrevious: Math.max(0, Math.round((legs[i]?.duration || 0) / 60)),
        travelCost: activity.travelCost?.status === 'unknown' ? activity.travelCost : { ...activity.travelCost, status: 'estimated' }
      }));
      days.push({ ...day, activities: enriched });
    } catch {
      days.push(day);
    }
  }
  return { ...plan, days };
}

async function fetchWeather(lat, lon, startDate, endDate) {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=auto&forecast_days=16`);
  if (!r.ok) return null;
  const data = await r.json();
  const label = (code) => ({0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Rain showers',81:'Rain showers',82:'Heavy rain showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Thunderstorm with hail'})[code] || `Weather code ${code}`;
  const daily = (data.daily?.time || []).map((date, i) => ({ date, weatherCode:data.daily.weather_code[i], weatherLabel:label(data.daily.weather_code[i]), tempMax:data.daily.temperature_2m_max[i], tempMin:data.daily.temperature_2m_min[i], precipitationProbability:data.daily.precipitation_probability_max[i] ?? 0, precipitation:data.daily.precipitation_sum[i] ?? 0, sunrise:data.daily.sunrise?.[i], sunset:data.daily.sunset?.[i] })).filter((d) => d.date >= startDate && d.date <= endDate);
  return { timezone:data.timezone, current:{ temperature:data.current.temperature_2m, apparentTemperature:data.current.apparent_temperature, humidity:data.current.relative_humidity_2m, precipitation:data.current.precipitation, windSpeed:data.current.wind_speed_10m, weatherCode:data.current.weather_code, weatherLabel:label(data.current.weather_code), observationTime:data.current.time }, daily };
}

async function fetchNearby(lat, lon) {
  const radiusSets = { r5km: 5000, r25km: 25000, r100km: 100000 };
  const out = {};
  for (const [key, radius] of Object.entries(radiusSets)) {
    const q = `[out:json][timeout:25];(nwr["name"]["tourism"](around:${radius},${lat},${lon});nwr["name"]["historic"](around:${radius},${lat},${lon});nwr["name"]["leisure"](around:${radius},${lat},${lon});nwr["name"]["amenity"~"restaurant|cafe|market|food_court"](around:${radius},${lat},${lon});nwr["name"]["hotel"](around:${radius},${lat},${lon}););out center tags;`;
    try {
      const r = await fetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', { method:'POST', headers:{'Content-Type':'text/plain'}, body:q });
      if (!r.ok) throw new Error(`Overpass ${r.status}`);
      const data = await r.json();
      out[key] = (data.elements || []).map((el) => { const p = el.center ? {lat:el.center.lat, lon:el.center.lon} : {lat:el.lat, lon:el.lon}; const tags = el.tags || {}; return { id:`osm-${el.type}-${el.id}`, name:tags.name, lat:p.lat, lon:p.lon, distanceKm:haversine(lat,lon,p.lat,p.lon), category: tags.tourism || tags.historic || tags.leisure || tags.amenity || tags.shop || 'place', subcategory:tags.tourism || tags.historic || tags.amenity, tags, source:'openstreetmap' }; }).filter((x) => x.name).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0, 180);
    } catch { out[key] = []; }
  }
  return out;
}

function haversine(lat1, lon1, lat2, lon2) { const p = Math.PI/180; const a = 0.5 - Math.cos((lat2-lat1)*p)/2 + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2; return 6371*2*Math.asin(Math.sqrt(a)); }
async function fetchOptionalProvider(baseUrl, apiKey, params) { if (!baseUrl) return null; try { const url = new URL(baseUrl); Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,String(v))); const r = await fetch(url, { headers: apiKey ? { Authorization:`Bearer ${apiKey}` } : {} }); if (!r.ok) return null; return await r.json(); } catch { return null; } }
function signal(data, source) { return data ? { status:'available', source, fetchedAt:new Date().toISOString(), data } : { status:'unavailable', source, fetchedAt:new Date().toISOString(), data:null, message:'Provider unavailable or not configured' }; }
function write(res, event) { res.write(`${JSON.stringify(event)}\n`); }
