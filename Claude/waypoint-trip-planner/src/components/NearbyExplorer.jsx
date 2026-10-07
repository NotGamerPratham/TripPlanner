import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Gem, LocateFixed, Mountain } from "lucide-react";
import { useTrip } from "../store/useTrip.js";
import TripMap, { RING_COLORS } from "./TripMap.jsx";
import { Badge, Card, Reveal, SectionHeader, Skeleton, Tabs, Unavailable } from "./ui.jsx";

const RINGS = [
  { id: "nearby", label: "Nearby ≤5 km", icon: LocateFixed },
  { id: "dayTrips", label: "Day trips ≤25 km", icon: Compass },
  { id: "hiddenGems", label: "Hidden gems ≤100 km", icon: Gem },
];

export default function NearbyExplorer() {
  const request = useTrip((s) => s.request);
  const places = useTrip((s) => s.places);
  const status = useTrip((s) => s.placesStatus);
  const error = useTrip((s) => s.placesError);
  const focusPlace = useTrip((s) => s.focusPlace);
  const [ring, setRing] = useState("nearby");
  if (!request) return null;

  const list = places?.rings?.[ring] ?? [];
  const layers = { nearby: true, dayTrips: ring !== "nearby", hiddenGems: ring === "hiddenGems" };

  return (
    <section id="explore" aria-labelledby="explore-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="explore-title" eyebrow="Step 3 · Around you" title="Real places, in three rings">
        Named sights from Wikipedia and OpenStreetMap — the same list Claude plans from, so every mapped stop exists.
      </SectionHeader>

      {status === "loading" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" aria-busy="true" aria-label="Loading nearby places">
          <Skeleton className="h-[420px] lg:col-span-2" />
          <Skeleton className="h-[420px] lg:col-span-3" />
        </div>
      )}
      {status === "error" && <Unavailable>Nearby places are unavailable right now: {error}</Unavailable>}
      {status === "ready" && places && (
        <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="flex flex-col p-4 lg:col-span-2">
            <Tabs
              label="Distance ring"
              tabs={RINGS.map((r) => ({ ...r, count: places.rings[r.id].length }))}
              value={ring}
              onChange={setRing}
              className="self-start"
            />
            <div role="tabpanel" aria-labelledby={`tab-${ring}`} className="mt-4 max-h-[460px] flex-1 overflow-y-auto pr-1">
              <AnimatePresence mode="wait">
                <motion.ul key={ring} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-1.5">
                  {list.length === 0 && (
                    <li>
                      <Unavailable>No named places found in this ring.</Unavailable>
                    </li>
                  )}
                  {list.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => focusPlace(p)}
                        className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/[0.06]"
                      >
                        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: RING_COLORS[ring] }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-white">{p.name}</span>
                            {ring === "hiddenGems" && p.kind === "nature" && <Mountain aria-label="nature" className="size-3.5 text-violet-300" />}
                          </span>
                          {p.description && <span className="block truncate text-xs text-white/55">{p.description}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-white/50">{p.distKm} km</span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
              <Badge tone={places.status.sights === "ok" ? "good" : "bad"} title={places.status.sights}>
                Sights: {places.status.sights === "ok" ? "Wikipedia" : "unavailable"}
              </Badge>
              <Badge tone={places.status.staysAndEats === "ok" ? "good" : "warn"} title={places.status.staysAndEats}>
                Hotels & food: {places.status.staysAndEats === "ok" ? `${places.stays.length} stays · ${places.eats.length} eateries (OSM)` : "OpenStreetMap busy — not listed"}
              </Badge>
            </div>
            {ring === "hiddenGems" && <p className="mt-2 text-xs text-white/45">Hidden gems = named natural and historic sites 25–100 km out, sampled around the region.</p>}
          </Card>
          <Card className="h-[420px] overflow-hidden lg:col-span-3 lg:h-auto lg:min-h-[520px]">
            <TripMap mode="explore" layers={layers} label={`Map of places around ${request.destination.name}`} />
          </Card>
        </Reveal>
      )}
    </section>
  );
}
