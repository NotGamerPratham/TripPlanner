import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { hasCoords } from "../lib/geo.js";
import { safeUrl } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";

export const DAY_COLORS = ["#f5b544", "#2dd4bf", "#a78bfa", "#ff7a59", "#60a5fa", "#f472b6", "#a3e635", "#fbbf24", "#34d399", "#c084fc", "#fb923c", "#38bdf8", "#e879f9", "#facc15"];
export const RING_COLORS = { nearby: "#2dd4bf", dayTrips: "#60a5fa", hiddenGems: "#a78bfa", stays: "#f5b544", eats: "#ff7a59" };

const pinCache = new Map();
function pin(n, color, faded = false) {
  const key = `${n}:${color}:${faded}`;
  if (!pinCache.has(key)) {
    const size = faded ? 20 : 28;
    pinCache.set(
      key,
      L.divIcon({
        className: "",
        html: `<div class="wp-pin" style="width:${size}px;height:${size}px;background:${color};opacity:${faded ? 0.55 : 1};font-size:${faded ? 10 : 12}px">${Number(n)}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      }),
    );
  }
  return pinCache.get(key);
}

function FitBounds({ points, padding = 40, signature }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.flyTo(points[0], 14, { duration: 0.8 });
    else map.flyToBounds(L.latLngBounds(points), { padding: [padding, padding], duration: 0.8, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}

function FocusPlace({ focus, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!focus || !hasCoords(focus)) return;
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 14), { duration: 0.8 });
    const ref = markerRefs.current.get(focus.id);
    if (ref) setTimeout(() => ref.openPopup(), 850);
  }, [focus, map, markerRefs]);
  return null;
}

function PlacePopup({ p, label }) {
  return (
    <div className="max-w-[220px]">
      <p className="font-semibold">{p.name}</p>
      {p.description && <p className="opacity-75">{p.description}</p>}
      <p className="mt-1 text-[11px] opacity-60">
        {label} · {p.distKm} km from centre
      </p>
      {safeUrl(p.url) && (
        <a href={safeUrl(p.url)} target="_blank" rel="noreferrer noopener" className="text-[11px]">
          {p.source === "wikipedia" ? "Wikipedia" : "OpenStreetMap"}
        </a>
      )}
    </div>
  );
}

/**
 * mode "explore": destination rings + place layers.
 * mode "plan": the active day's numbered stops and route, other days faded.
 */
export default function TripMap({ mode = "plan", layers = {}, className = "h-full w-full", label }) {
  const request = useTrip((s) => s.request);
  const places = useTrip((s) => s.places);
  const plan = useTrip((s) => s.plan);
  const routes = useTrip((s) => s.routes);
  const activeDayKey = useTrip((s) => s.activeDayKey);
  const mapFocus = useTrip((s) => s.mapFocus);
  const markerRefs = useRef(new Map());

  const center = request ? [request.destination.lat, request.destination.lon] : [20, 0];
  const activeIndex = plan.days.findIndex((d) => d.key === activeDayKey);
  const activeDay = plan.days[activeIndex];
  const color = DAY_COLORS[Math.max(0, activeIndex) % DAY_COLORS.length];
  const stops = useMemo(() => (activeDay ? activeDay.activities.filter((a) => !a.skipped && hasCoords(a)) : []), [activeDay]);
  const route = activeDay ? routes[activeDay.key] : null;

  const fitPoints =
    mode === "plan" && stops.length
      ? stops.map((s) => [s.lat, s.lon])
      : mode === "explore" && places
        ? [...places.rings.nearby, ...(layers.dayTrips ? places.rings.dayTrips : []), ...(layers.hiddenGems ? places.rings.hiddenGems : [])].map((p) => [p.lat, p.lon])
        : [center];
  const fitSig = `${mode}:${activeDayKey}:${stops.map((s) => s.id).join(",")}:${layers.dayTrips}:${layers.hiddenGems}:${places ? 1 : 0}`;

  if (!request) return null;

  const poiLayer = (key, list, labelText) =>
    layers[key] &&
    list.map((p) => (
      <CircleMarker
        key={`${key}-${p.id}`}
        center={[p.lat, p.lon]}
        radius={key === "hiddenGems" ? 7 : 5}
        pathOptions={{ color: RING_COLORS[key], weight: 2, fillColor: RING_COLORS[key], fillOpacity: 0.55 }}
        ref={(r) => r && markerRefs.current.set(p.id, r)}
      >
        <Popup>
          <PlacePopup p={p} label={labelText} />
        </Popup>
      </CircleMarker>
    ));

  return (
    <MapContainer
      center={center}
      zoom={mode === "explore" ? 11 : 13}
      scrollWheelZoom={false}
      className={className}
      aria-label={label ?? "Trip map"}
      attributionControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitBounds points={fitPoints} signature={fitSig} padding={mode === "plan" ? 50 : 30} />
      <FocusPlace focus={mapFocus} markerRefs={markerRefs} />

      {mode === "explore" && (
        <>
          {[5, 25, 100].map((km) => (
            <Circle
              key={km}
              center={center}
              radius={km * 1000}
              pathOptions={{ color: km === 5 ? RING_COLORS.nearby : km === 25 ? RING_COLORS.dayTrips : RING_COLORS.hiddenGems, weight: 1, dashArray: "4 8", fill: false, opacity: 0.6 }}
            />
          ))}
          <CircleMarker center={center} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#f5b544", fillOpacity: 1 }}>
            <Tooltip direction="top">{request.destination.name} centre</Tooltip>
          </CircleMarker>
        </>
      )}

      {places && (
        <>
          {poiLayer("nearby", places.rings.nearby, "Nearby")}
          {poiLayer("dayTrips", places.rings.dayTrips, "Day trip")}
          {poiLayer("hiddenGems", places.rings.hiddenGems, "Hidden gem")}
          {poiLayer("stays", places.stays, "Stay")}
          {poiLayer("eats", places.eats, "Eat")}
        </>
      )}

      {mode === "plan" && (
        <>
          {plan.days.map((d, di) =>
            d.key === activeDayKey
              ? null
              : d.activities
                  .filter((a) => !a.skipped && hasCoords(a))
                  .map((a, i) => (
                    <Marker key={a.id} position={[a.lat, a.lon]} icon={pin(i + 1, DAY_COLORS[di % DAY_COLORS.length], true)} zIndexOffset={-500}>
                      <Tooltip direction="top">
                        Day {d.day}: {a.title}
                      </Tooltip>
                    </Marker>
                  )),
          )}
          {route?.status === "ok" ? (
            <Polyline positions={route.data.geometry} pathOptions={{ color, weight: 4, opacity: 0.9 }} />
          ) : (
            stops.length > 1 && <Polyline positions={stops.map((s) => [s.lat, s.lon])} pathOptions={{ color, weight: 2, opacity: 0.7, dashArray: "6 8" }} />
          )}
          {stops.map((a, i) => (
            <Marker key={a.id} position={[a.lat, a.lon]} icon={pin(i + 1, color)} ref={(r) => r && markerRefs.current.set(a.id, r)} zIndexOffset={500}>
              <Popup>
                <div className="max-w-[220px]">
                  <p className="font-semibold">
                    {a.time} · {a.title}
                  </p>
                  <p className="opacity-75">{a.description}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
