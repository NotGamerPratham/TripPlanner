# Waypoint: Situational Trip Planner

## Concept
Waypoint is a cinematic trip planning workspace that creates a budget-aware, weather-aware itinerary from destination, dates, traveler count, budget, style, interests, food preferences and transport preferences. The backend gathers live weather from Open-Meteo, place data from OpenStreetMap Overpass and road routes from OSRM. Events, closures, safety alerts and crowd levels are provider adapters, so the UI explicitly reports when those datasets are unavailable instead of inventing values. Claude returns a schema-constrained JSON itinerary, and the server validates the payload again before streaming the sections to the client.

## Stack
React + Vite + TypeScript + Tailwind + Framer Motion
Node + Express proxy + Anthropic SDK + Zod
Leaflet + React Leaflet
Open-Meteo + Overpass + Nominatim + OSRM

## Run
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set `ANTHROPIC_API_KEY`.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:5173`.

## Optional provider adapters
Set `EVENTS_API_URL`, `CLOSURES_API_URL`, `SAFETY_API_URL`, or `CROWD_API_URL` to a trusted endpoint owned by your stack. The endpoint is called with `lat`, `lon`, `startDate`, `endDate`, `destination` and `timezone`, plus an API key when configured. The response is retained as a source object and passed to Claude. Any adapter failure produces an `unavailable` status.

## Production notes
Use a persistent store for saved plans instead of localStorage. Add an authenticated share endpoint for server-side links. Put server-side caching in front of Open-Meteo, Overpass and optional providers. Replace public OSRM with your own router if usage grows. Add provider-specific terms and attribution requirements to the production legal pages.

## Data honesty rule
The app does not fabricate entry fees, hotel rates, event details, closures, safety alerts or crowd levels. Unknown values are rendered as `Unknown` or `Unavailable` and remain unknown in the Claude input.
