# Waypoint — a live, budget-aware trip planner

Waypoint turns *what is actually happening at a destination right now* into a day-by-day plan you can edit. It reads the 16-day forecast, safety alerts, public holidays and real places within 100 km, hands that data to Claude, and streams the plan back section by section. Days are ordered around the weather, every stop links to a real mapped place where possible, and the budget is recalculated live as you drag things around.

## Concept

| Layer | What it does |
|---|---|
| **Live context** (key-free open data) | Open-Meteo forecast (16 days), hourly rain, air quality and last year's observed weather on the same dates; USGS earthquakes, GDACS disaster events, US NWS alerts; Nager.Date holidays; Wikidata country facts and emergency numbers; ECB exchange rates (Frankfurter); optional Ticketmaster events. |
| **Real places** | Wikipedia GeoSearch for sights in three rings (≤5 km nearby, 5–25 km day trips, 25–100 km hidden gems). OpenStreetMap/Overpass for hotels and eateries. OSRM for real walking/driving times. |
| **Planner** (Claude) | Gets the trip request plus the live data and place lists, and returns the plan through `emit_*` tool calls: overview, one call per day, stays, food, transport, extras. The server validates each call against a shared Zod schema, swaps place IDs for real coordinates, and streams each valid section to the browser as NDJSON. If a section is invalid or missing, it goes back to Claude as a tool error so Claude can fix it. |
| **Editor** | Drag stops within or between days (mouse, touch, keyboard). Skip a stop or use its budget alternative. Times, travel legs, day totals and the budget donut all update immediately. You can also re-sort days to fit the weather, make the plan cheaper, save it, share it as a link, export a PDF, or ask the chat assistant. |

**Honesty rules.** Live facts come only from the sources above. When a source is down or doesn't exist, the UI says so (for example: crowd levels are a labelled heuristic; closures and strikes have no open feed; events say "not connected" when there's no key). Claude is told never to invent live facts. Anything it couldn't confirm goes into a "Verify before you go" list. Stops that don't match a mapped place are tagged "not on map".

## Run it

Requires **Node 20.12+** (tested on Node 22).

```bash
npm install
```

```bash
cp .env.example .env
```

Put your key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Start the API (port 8787) and Vite (port 5173) together:

```bash
npm run dev
```

Open http://localhost:5173. Live conditions, places and the map work without a key. Planning, "make it cheaper" and chat need `ANTHROPIC_API_KEY`.

Production (one Node process serves both the API and the built SPA on `PORT`):

```bash
npm run build
```

```bash
npm start
```

## File structure

```
waypoint-trip-planner/
├─ index.html                 # SPA shell
├─ vite.config.js             # React + Tailwind v4 plugins, /api proxy → API_PORT
├─ .env.example               # all server-side settings (keys never reach the browser)
├─ shared/
│  ├─ schema.js               # Zod schemas: trip request, every plan section, saved/shared trips
│  └─ weather.js              # WMO weather codes, "wetness" score for weather fitting
├─ server/
│  ├─ index.js                # Express: helmet CSP, rate limits, routes, static hosting in prod
│  ├─ lib/
│  │  ├─ cache.js             # TTL cache with in-flight de-duplication
│  │  ├─ http.js              # fetch with timeouts + polite User-Agent
│  │  ├─ live.js              # aggregates every live source with per-source status
│  │  ├─ prompt.js            # system prompts + compact data blocks for Claude
│  │  └─ tools.js             # emit_* tool definitions generated from the Zod schemas
│  ├─ routes/
│  │  ├─ live.js              # GET /api/geocode, /api/live, /api/places, /api/route
│  │  └─ ai.js                # POST /api/ai/plan, /api/ai/cheaper, /api/ai/chat (NDJSON streams)
│  └─ services/
│     ├─ openmeteo.js         # geocoding, forecast, air quality, last-year archive
│     ├─ alerts.js            # derived weather warnings, USGS, GDACS, NWS
│     ├─ country.js           # Wikidata facts, holidays, FX, Ticketmaster, crowd heuristic
│     ├─ places.js            # Wikipedia GeoSearch rings + Overpass stays/eats (mirror failover)
│     └─ routing.js           # OSRM foot/car routes
└─ src/
   ├─ main.jsx                # fonts, Leaflet CSS, MotionConfig reducedMotion="user"
   ├─ App.jsx                 # page composition; post-submit sections are lazy-loaded
   ├─ index.css               # Tailwind v4 theme tokens, glass utilities, print + reduced-motion CSS
   ├─ store/useTrip.js        # Zustand store: streaming client, editing, routing, save/share, chat
   ├─ lib/                    # api (NDJSON reader), budget, optimize, geo, share, storage, pdf, format
   └─ components/
      ├─ Hero.jsx             # cinematic parallax SVG landscape
      ├─ PlannerForm.jsx      # inputs + accessible destination combobox
      ├─ LiveDashboard.jsx    # "Right now in …", forecast strip, alerts, holidays, crowds, sources
      ├─ NearbyExplorer.jsx   # 5/25/100 km rings + map
      ├─ PlanSection.jsx      # stream progress, overview, action bar, itinerary + sticky map
      ├─ Itinerary.jsx        # dnd-kit drag-and-drop days with live costs and routed travel times
      ├─ TripMap.jsx          # Leaflet: numbered stops, OSRM route, POI layers
      ├─ TripDetails.jsx      # stays (3 per tier), food guide, transport
      ├─ BudgetPanel.jsx      # animated donut + table, 10% buffer, money hacks
      ├─ Essentials.jsx       # packing checklist, safety, scams, emergency numbers
      ├─ ChatAssistant.jsx    # streaming chat grounded in the plan + live data
      └─ Chrome.jsx           # nav, scroll progress, saved-trips drawer, toasts, footer
```

## API

| Method & path | Purpose |
|---|---|
| `GET /api/health` | `{ ai, model, events }`, so the UI can explain what's enabled |
| `GET /api/geocode?q=` | Destination search |
| `GET /api/live?lat&lon&cc&country&tz&start&days&currency` | Live snapshot with a `sources[]` status for each source |
| `GET /api/places?lat&lon` | `{ rings: { nearby, dayTrips, hiddenGems }, stays, eats, status }` |
| `GET /api/route?profile=foot\|car&coords=lat,lon;…` | OSRM geometry + per-leg minutes |
| `POST /api/ai/plan` | `{ request }` → NDJSON events: `status`, `thinking`, `section_start`, `section`, `section_retry`, `error`, `done` |
| `POST /api/ai/cheaper` | `{ request, plan, total }` → re-emitted cheaper sections (same events) |
| `POST /api/ai/chat` | `{ request?, plan?, total?, messages }` → NDJSON `text` deltas |

## Claude integration notes

- Model `claude-opus-5-5` with adaptive thinking (summarized, shown as a live "thinking" ticker), `output_config.effort` (`PLAN_EFFORT` / `CHAT_EFFORT`), and streaming via the official `@anthropic-ai/sdk`.
- **Server-side refusal fallback is on** (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta). If a safety classifier declines, the API retries on an appropriate model in the same call. Set `ANTHROPIC_FALLBACKS=off` to disable it.
- Tools use `eager_input_streaming`. Every tool input is validated with Zod on the server before it reaches the browser. The loop is append-only and capped at 4 turns. Truncated (`max_tokens`) and refused turns are handled explicitly.
- The system prompt and tools are fixed and placed first, so they can be prompt-cached. Trip-specific data goes in the user turn.

## Accessibility & motion

Semantic landmarks, a skip link, labelled controls, an ARIA 1.2 combobox, roving-focus tabs, and keyboard drag-and-drop with screen-reader announcements. The donut chart has a data table next to it, and status changes are announced through live regions. `MotionConfig reducedMotion="user"` and CSS media queries freeze the parallax, twinkle and flight-path animations for users who prefer reduced motion.

## Known limits

- Prices, entry fees and hotel rates are AI estimates and are labelled that way.
- Crowd levels are a heuristic. No free live crowd feed exists.
- Public Overpass servers are often overloaded. When they are, hotels and eateries are left out and the plan describes areas instead of naming businesses. Set `OVERPASS_URL` to your own instance for reliability.
- `routing.openstreetmap.de` and CARTO tiles are fine for development. For production traffic, self-host OSRM (`ROUTING_URL`) and check CARTO's terms.
- The PDF uses jsPDF's built-in Latin fonts. For non-Latin scripts (Japanese, Devanagari, …) use **Print → Save as PDF**.
- Share links hold the whole trip in the URL fragment (usually 3–6 KB compressed). Nothing is uploaded.
