import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import type { ItineraryPlan, LiveContext, Place } from '../types';
import { getRoute } from '../lib/api';

const icon = L.divIcon({ className: 'waypoint-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });

export default function MapPanel({ plan, context }: { plan: ItineraryPlan; context: LiveContext }) {
  const places = useMemo(() => Object.fromEntries([...context.nearby.r5km, ...context.nearby.r25km, ...context.nearby.r100km].map((x) => [x.id, x])), [context]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const orderedCoords = useMemo(() => {
    const coords: Array<[number, number]> = [];
    plan.days.forEach((day) => day.activities.forEach((activity) => {
      const p = activity.placeId ? (places[activity.placeId] as Place | undefined) : undefined;
      if (p) coords.push([p.lat, p.lon]);
    }));
    return coords.slice(0, 25);
  }, [plan, places]);

  useEffect(() => {
    let alive = true;
    if (orderedCoords.length < 2) return;
    getRoute(orderedCoords).then((res) => { if (alive) setRoute(res.geometry); }).catch(() => setRoute([]));
    return () => { alive = false; };
  }, [orderedCoords]);

  return <section className="glass-panel overflow-hidden"><div className="border-b border-white/10 px-5 py-4"><p className="eyebrow">Map</p><h2 className="mt-1 text-xl font-semibold">Compact routes, fewer backtracks</h2></div><div className="relative h-[520px]"><MapContainer center={[context.destination.lat, context.destination.lon]} zoom={11} scrollWheelZoom className="h-full w-full"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[context.destination.lat, context.destination.lon]} icon={icon}><Popup>{context.destination.name}</Popup></Marker>{orderedCoords.map(([lat, lon], index) => <Marker key={`${lat}-${lon}-${index}`} position={[lat, lon]} icon={icon}><Popup>Stop {index + 1}</Popup></Marker>)}{route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#ffffff', weight: 4, opacity: 0.7 }} />}<FitBounds coords={orderedCoords} /></MapContainer></div></section>;
}

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (coords.length > 1) map.fitBounds(L.latLngBounds(coords), { padding: [32, 32] }); }, [map, coords]);
  return null;
}
