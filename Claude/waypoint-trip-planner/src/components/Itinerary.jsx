import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bike,
  Building2,
  Bus,
  Camera,
  Car,
  ChevronDown,
  Coffee,
  EyeOff,
  Footprints,
  Gem,
  GripVertical,
  Landmark,
  MapPin,
  MapPinOff,
  Moon,
  Mountain,
  PiggyBank,
  RotateCcw,
  Ship,
  ShoppingBag,
  Sparkles,
  Umbrella,
  Undo2,
  Utensils,
} from "lucide-react";
import { wmoLabel, wetness } from "../../shared/weather.js";
import { activityCost, mealsForDay } from "../lib/budget.js";
import { duration, fmtDate, money } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";
import AnimatedNumber from "./AnimatedNumber.jsx";
import { DAY_COLORS } from "./TripMap.jsx";
import { Badge, Card, Skeleton, WeatherIcon, cx } from "./ui.jsx";

const KIND_ICON = {
  sight: Camera,
  museum: Building2,
  nature: Mountain,
  food: Utensils,
  experience: Sparkles,
  shopping: ShoppingBag,
  nightlife: Moon,
  transit: Bus,
  rest: Coffee,
};
const MODE_ICON = { walk: Footprints, transit: Bus, taxi: Car, car: Car, bike: Bike, ferry: Ship, none: Footprints };

function TravelConnector({ minutes, mode, routed }) {
  if (!minutes) return null;
  const Icon = MODE_ICON[mode] ?? Footprints;
  return (
    <div className="flex items-center gap-2 py-1 pl-[3.25rem] text-[11px] text-white/45">
      <span aria-hidden className="h-4 border-l border-dashed border-white/20" />
      <Icon aria-hidden className="size-3" />
      <span>
        {routed ? "" : "~"}
        {duration(minutes)} {routed ? `by ${routed}` : mode !== "none" ? mode : ""}
        {routed ? " · routed" : " · est."}
      </span>
    </div>
  );
}

function ActivityCard({ a, dayKey, currency, travelers, dragging, overlay, handleProps }) {
  const toggleSkip = useTrip((s) => s.toggleSkip);
  const toggleAlternative = useTrip((s) => s.toggleAlternative);
  const focusPlace = useTrip((s) => s.focusPlace);
  const setActiveDay = useTrip((s) => s.setActiveDay);
  const Icon = KIND_ICON[a.kind] ?? Landmark;
  return (
    <div
      className={cx(
        "group relative flex gap-3 rounded-xl border p-3 transition",
        overlay ? "glass-strong border-sun/50 shadow-2xl" : "border-white/8 bg-white/[0.03] hover:border-white/15",
        dragging && "opacity-40",
        a.skipped && "opacity-50",
      )}
    >
      <button
        type="button"
        className="mt-0.5 flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-white/35 hover:bg-white/10 hover:text-white active:cursor-grabbing"
        aria-label={`Move ${a.title}. Press space to pick up, arrow keys to move between stops and days, space to drop.`}
        {...handleProps}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="w-12 shrink-0">
        <p className="font-mono text-sm font-semibold text-white">{a.time}</p>
        <p className="text-[11px] text-white/45">{duration(a.durationMin)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon aria-hidden className="size-4 text-sun" />
          <h4 className={cx("font-semibold text-white", a.skipped && "line-through")}>{a.title}</h4>
          {a.offbeat && (
            <Badge tone="gem" icon={Gem}>
              offbeat
            </Badge>
          )}
          {a.indoor && <Badge tone="info">indoor</Badge>}
          {a.swapped && <Badge tone="good">budget swap</Badge>}
          {a.verified === false && a.kind !== "transit" && a.kind !== "rest" && (
            <Badge tone="neutral" icon={MapPinOff} title="Not matched to a mapped place — verify the location">
              not on map
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-white/65">{a.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold text-white/90">
            {a.costPerPerson === 0 ? "Free" : `${money(a.costPerPerson, currency)} pp`}
            {a.costPerPerson > 0 && travelers > 1 && <span className="font-normal text-white/45"> · {money(a.costPerPerson * travelers, currency)} total</span>}
          </span>
          {a.costNote && <span className="text-white/45">{a.costNote}</span>}
        </div>
        {!overlay && (
          <div className="mt-2 flex flex-wrap gap-1 opacity-100 transition sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {a.lat != null && (
              <button
                type="button"
                onClick={() => {
                  setActiveDay(dayKey);
                  focusPlace(a);
                }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                <MapPin aria-hidden className="size-3" /> Map
              </button>
            )}
            {(a.budgetAlternative || a.swapped) && (
              <button
                type="button"
                onClick={() => toggleAlternative(dayKey, a.id)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-emerald-200/90 hover:bg-emerald-400/10"
                title={a.budgetAlternative ? `${a.budgetAlternative.title} · ${money(a.budgetAlternative.costPerPerson, currency)} pp` : "Restore the original stop"}
              >
                {a.swapped ? <Undo2 aria-hidden className="size-3" /> : <PiggyBank aria-hidden className="size-3" />}
                {a.swapped ? "Undo swap" : `Cheaper: ${money(a.budgetAlternative.costPerPerson, currency)}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleSkip(dayKey, a.id)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
              aria-pressed={Boolean(a.skipped)}
            >
              {a.skipped ? <RotateCcw aria-hidden className="size-3" /> : <EyeOff aria-hidden className="size-3" />}
              {a.skipped ? "Restore" : "Skip"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableActivity(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.a.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <ActivityCard {...props} dragging={isDragging} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function DayCard({ day, index, forecast, currency, travelers, route, isActive, onActivate, food }) {
  const [planB, setPlanB] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: day.key });
  const dayCost = useMemo(() => {
    const acts = day.activities.reduce((n, a) => n + activityCost(a), 0);
    const meals = mealsForDay(food, day.day) ?? 0;
    return (acts + meals + (day.localTransportPerPerson ?? 0)) * travelers;
  }, [day, food, travelers]);
  const meals = food?.daily?.find((m) => m.day === day.day);
  const color = DAY_COLORS[index % DAY_COLORS.length];
  const wet = forecast ? wetness(forecast) : null;
  const outdoorHeavy = day.activities.filter((a) => !a.indoor && !a.skipped).length > day.activities.length / 2;

  // Map routed legs onto consecutive mapped stops for "routed" travel times.
  const legs = route?.status === "ok" ? route.data.legs : null;
  let legIdx = 0;
  let prevMapped = false;

  return (
    <motion.article
      layout
      id={`day-${day.day}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      aria-labelledby={`day-${day.key}-title`}
    >
      <Card className={cx("overflow-hidden transition", isActive && "ring-1 ring-sun/40")}>
        <button type="button" onClick={onActivate} className="flex w-full flex-wrap items-start gap-4 p-5 text-left" aria-pressed={isActive}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-semibold text-ink-950" style={{ background: color }}>
            {day.day}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wide text-white/50 uppercase">
              {fmtDate(day.date, { weekday: "long", day: "numeric", month: "short" })} · {day.area}
            </span>
            <span id={`day-${day.key}-title`} className="block font-display text-xl font-semibold text-white">
              {day.title}
            </span>
            <span className="mt-1 block text-sm text-white/60">{day.weatherFit}</span>
          </span>
          <span className="flex flex-col items-end gap-1 text-right">
            {forecast ? (
              <span className="flex items-center gap-1.5 text-sm text-white/80" title={wmoLabel(forecast.code)}>
                <WeatherIcon code={forecast.code} className="size-5" />
                {Math.round(forecast.tMax)}° · {forecast.precipProb ?? 0}%
              </span>
            ) : (
              <span className="text-xs text-white/45">no forecast yet</span>
            )}
            {wet != null && wet > 0.55 && outdoorHeavy && (
              <Badge tone="warn" icon={Umbrella}>
                wet day, mostly outdoors
              </Badge>
            )}
            <span className="text-sm font-semibold text-white">
              <AnimatedNumber value={dayCost} format={(v) => money(v, currency)} />
              <span className="font-normal text-white/45"> /day</span>
            </span>
          </span>
        </button>

        <div ref={setNodeRef} className={cx("px-3 pb-3 sm:px-5", isOver && "rounded-xl bg-sun/[0.04]")}>
          <SortableContext items={day.activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            {day.activities.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-white/50">Drop a stop here</p>}
            {day.activities.map((a, i) => {
              let connector = null;
              const mapped = !a.skipped && a.lat != null;
              if (i > 0 && !a.skipped) {
                const routedLeg = mapped && prevMapped && legs ? legs[legIdx++] : null;
                connector = (
                  <TravelConnector
                    minutes={routedLeg?.durationMin ?? a.travelMinFromPrev}
                    mode={a.travelMode}
                    routed={routedLeg ? (route.data.profile === "foot" ? "foot" : "road") : null}
                  />
                );
              }
              if (mapped) prevMapped = true;
              return (
                <div key={a.id}>
                  {connector}
                  <SortableActivity a={a} dayKey={day.key} currency={currency} travelers={travelers} />
                </div>
              );
            })}
          </SortableContext>

          {meals && (
            <div className="mt-3 grid gap-2 rounded-xl bg-white/[0.03] p-3 text-xs sm:grid-cols-3">
              {["breakfast", "lunch", "dinner"].map((k) => (
                <p key={k}>
                  <span className="font-semibold text-white/80 capitalize">{k}: </span>
                  <span className="text-white/65">
                    {meals[k].dish} — {meals[k].name}
                  </span>
                  <span className="text-white/45"> · {money(meals[k].costPerPerson, currency)}</span>
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            {day.tip && <p className="max-w-xl text-xs leading-relaxed text-white/55">💡 {day.tip}</p>}
            <button
              type="button"
              onClick={() => setPlanB((v) => !v)}
              aria-expanded={planB}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs text-sky-100 hover:bg-sky-400/20"
            >
              <Umbrella aria-hidden className="size-3.5" /> Rain plan B
              <ChevronDown aria-hidden className={cx("size-3.5 transition", planB && "rotate-180")} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {planB && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-400/[0.06] p-3 text-sm">
                  <p className="text-white/80">{day.rainPlanB.summary}</p>
                  <ul className="mt-2 space-y-1">
                    {day.rainPlanB.swaps.map((s, i) => (
                      <li key={i} className="text-white/65">
                        <span className="font-medium text-white">{s.title}</span> — {s.note}{" "}
                        <span className="text-white/45">({s.costPerPerson ? `${money(s.costPerPerson, currency)} pp` : "free"})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.article>
  );
}

export default function Itinerary() {
  const plan = useTrip((s) => s.plan);
  const request = useTrip((s) => s.request);
  const live = useTrip((s) => s.live);
  const routes = useTrip((s) => s.routes);
  const activeDayKey = useTrip((s) => s.activeDayKey);
  const setActiveDay = useTrip((s) => s.setActiveDay);
  const moveActivity = useTrip((s) => s.moveActivity);
  const commitMove = useTrip((s) => s.commitMove);
  const planStatus = useTrip((s) => s.planStatus);
  const pendingSection = useTrip((s) => s.pendingSection);
  const [activeId, setActiveId] = useState(null);
  const [touched, setTouched] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const forecastByDate = useMemo(() => Object.fromEntries((live?.weather?.daily ?? []).map((d) => [d.date, d])), [live]);
  const dayOf = (id) => plan.days.find((d) => d.key === id || d.activities.some((a) => a.id === id));
  const activeItem = activeId ? plan.days.flatMap((d) => d.activities).find((a) => a.id === activeId) : null;
  const titleOf = (id) => plan.days.flatMap((d) => d.activities).find((a) => a.id === id)?.title ?? "stop";

  const onDragStart = ({ active }) => {
    setActiveId(active.id);
    setTouched([dayOf(active.id)?.key].filter(Boolean));
  };
  const onDragOver = ({ active, over }) => {
    if (!over) return;
    const from = dayOf(active.id);
    const to = dayOf(over.id);
    if (!from || !to || from.key === to.key) return;
    const overIndex = to.activities.findIndex((a) => a.id === over.id);
    moveActivity(active.id, to.key, overIndex >= 0 ? overIndex : to.activities.length);
    setTouched((t) => [...new Set([...t, to.key])]);
  };
  const onDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (over) {
      const day = dayOf(active.id);
      const to = dayOf(over.id);
      if (day && to && day.key === to.key && active.id !== over.id) {
        const idx = to.activities.findIndex((a) => a.id === over.id);
        if (idx >= 0) moveActivity(active.id, to.key, idx);
      }
    }
    commitMove([...new Set([...touched, dayOf(active.id)?.key].filter(Boolean))]);
    setTouched([]);
  };

  const announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${dayOf(over.id) ? `day ${dayOf(over.id).day}` : "another stop"}.` : ""),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${titleOf(active.id)} in day ${dayOf(over.id)?.day ?? ""}. Times and costs updated.` : "Move cancelled."),
    onDragCancel: ({ active }) => `Move of ${titleOf(active.id)} cancelled.`,
  };

  if (!request) return null;
  const remainingDays = Array.from({ length: request.days }, (_, i) => i + 1).filter((n) => !plan.days.some((d) => d.day === n));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements }}
    >
      <div className="space-y-4">
        {plan.days.map((day, i) => (
          <DayCard
            key={day.key}
            day={day}
            index={i}
            forecast={forecastByDate[day.date]}
            currency={request.currency}
            travelers={request.travelers}
            route={routes[day.key]}
            isActive={day.key === activeDayKey}
            onActivate={() => setActiveDay(day.key)}
            food={plan.food}
          />
        ))}
        {planStatus === "streaming" &&
          remainingDays.map((n, i) => (
            <div key={n} className="glass rounded-2xl p-5" aria-hidden>
              <div className="flex items-center gap-4">
                <Skeleton className="size-11 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-5 w-64" />
                </div>
              </div>
              {i === 0 && pendingSection === "day" && (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              )}
            </div>
          ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180 }}>
        {activeItem ? <ActivityCard a={activeItem} dayKey="" currency={request.currency} travelers={request.travelers} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
