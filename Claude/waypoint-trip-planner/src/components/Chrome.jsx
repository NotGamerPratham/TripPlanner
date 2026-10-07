// App chrome: navigation, scroll progress, saved-trips drawer, toasts, footer.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { Compass, FolderOpen, Trash2, X } from "lucide-react";
import { deleteTrip, listTrips } from "../lib/storage.js";
import { fmtDate } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";
import { Button, cx } from "./ui.jsx";

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-sun via-coral to-iris" />;
}

export function Nav({ onOpenTrips }) {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));
  const request = useTrip((s) => s.request);
  const hasPlan = useTrip((s) => s.plan.days.length > 0);
  const links = [
    ["#plan", "Plan", true],
    ["#live", "Live", Boolean(request)],
    ["#explore", "Explore", Boolean(request)],
    ["#itinerary", "Itinerary", Boolean(request)],
    ["#budget", "Budget", hasPlan],
    ["#essentials", "Essentials", hasPlan],
  ].filter(([, , show]) => show);

  return (
    <nav aria-label="Main" className={cx("no-print fixed inset-x-0 top-0 z-40 transition-all duration-300", solid ? "glass-strong border-x-0 border-t-0" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-display text-lg font-semibold text-white">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-sun to-coral text-ink-950">
            <Compass aria-hidden className="size-4.5" />
          </span>
          Waypoint
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map(([href, label]) => (
            <li key={href}>
              <a href={href} className="rounded-full px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <Button size="sm" icon={FolderOpen} onClick={onOpenTrips}>
          My trips
        </Button>
      </div>
    </nav>
  );
}

export function TripsDrawer({ open, onClose }) {
  const loadTrip = useTrip((s) => s.loadTrip);
  const toast = useTrip((s) => s.toast);
  const [trips, setTrips] = useState([]);
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setTrips(listTrips());
    setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Saved trips"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", bounce: 0.1, duration: 0.45 }}
            className="glass-strong fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-white">My trips</h2>
              <button ref={closeRef} type="button" onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-white/50">Saved in this browser only. Use Share to send a trip anywhere.</p>
            <ul className="mt-5 flex-1 space-y-2 overflow-y-auto">
              {trips.length === 0 && <li className="text-sm text-white/55">No saved trips yet — build a plan and press Save.</li>}
              {trips.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      loadTrip(t);
                      onClose();
                      toast(`Opened ${t.plan.overview?.title ?? t.request.destination.name}.`, "good");
                      setTimeout(() => document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth" }), 100);
                    }}
                  >
                    <span className="block truncate font-medium text-white">{t.plan.overview?.title ?? t.request.destination.name}</span>
                    <span className="block text-xs text-white/50">
                      {t.request.destination.name} · {fmtDate(t.request.startDate)} · {t.request.days} days
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${t.plan.overview?.title ?? t.request.destination.name}`}
                    className="rounded-full p-2 text-white/50 hover:bg-red-500/15 hover:text-red-200"
                    onClick={() => {
                      deleteTrip(t.id);
                      setTrips(listTrips());
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const toasts = useTrip((s) => s.toasts);
  const tone = { good: "border-emerald-300/30", bad: "border-red-300/30", info: "border-white/15" };
  return (
    <div className="no-print pointer-events-none fixed bottom-5 left-4 z-[70] flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className={cx("glass-strong pointer-events-auto rounded-xl border px-4 py-3 text-sm text-white shadow-xl", tone[t.tone] ?? tone.info)}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/8 px-4 py-12 text-sm text-white/50 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-3">
        <p className="font-display text-base text-white/80">Waypoint</p>
        <p>
          Live data: Open-Meteo (forecast, air quality, history) · Wikipedia GeoSearch · © OpenStreetMap contributors · CARTO basemap · OSRM routing ·
          Wikidata · Nager.Date · Frankfurter/ECB · USGS · GDACS · US NWS. Plans are generated by Claude.
        </p>
        <p>Prices, opening hours and fees are estimates — confirm on official sites before booking. Crowd levels are heuristic estimates.</p>
      </div>
    </footer>
  );
}
