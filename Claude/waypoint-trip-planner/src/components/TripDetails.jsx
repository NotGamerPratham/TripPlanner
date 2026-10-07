import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Backpack, BedDouble, Bike, Bus, Car, Crown, Hotel, MapPin, MapPinOff, Plane, Ship, Star, Train, Utensils } from "lucide-react";
import { money } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";
import { Badge, Card, Reveal, SectionHeader, Skeleton, Tabs, cx } from "./ui.jsx";

const TIERS = [
  { id: "backpacker", label: "Budget", icon: Backpack },
  { id: "mid", label: "Mid-range", icon: Hotel },
  { id: "luxury", label: "Luxury", icon: Crown },
];
const MODE_ICON = { flight: Plane, train: Train, bus: Bus, car: Car, ferry: Ship, other: Bike };

function Stays() {
  const stays = useTrip((s) => s.plan.stays);
  const choices = useTrip((s) => s.choices);
  const setChoices = useTrip((s) => s.setChoices);
  const request = useTrip((s) => s.request);
  const places = useTrip((s) => s.places);
  const focusPlace = useTrip((s) => s.focusPlace);
  if (!stays) return <Skeleton className="h-72" />;
  const nights = Math.max(1, request.days - 1);
  const options = stays.tiers[choices.stayTier] ?? [];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <BedDouble aria-hidden className="size-4 text-sun" /> Where to stay
        </h3>
        <Tabs label="Stay tier" tabs={TIERS} value={choices.stayTier} onChange={(stayTier) => setChoices({ stayTier, stayIndex: 0 })} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={choices.stayTier}
          role="radiogroup"
          aria-label={`${choices.stayTier} stays`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mt-5 grid gap-3 md:grid-cols-3"
        >
          {options.map((o, i) => {
            const selected = choices.stayIndex === i;
            return (
              <div
                key={o.name}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setChoices({ stayIndex: i })}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setChoices({ stayIndex: i });
                  }
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") setChoices({ stayIndex: (i + 1) % options.length });
                  if (e.key === "ArrowLeft" || e.key === "ArrowUp") setChoices({ stayIndex: (i + options.length - 1) % options.length });
                }}
                className={cx(
                  "cursor-pointer rounded-xl border p-4 text-left transition",
                  selected ? "border-sun/70 bg-sun/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/25",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-white">{o.name}</p>
                  {stays.recommendedTier === choices.stayTier && i === 0 && (
                    <Badge tone="good" icon={Star}>
                      pick
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/55">{o.area}</p>
                <p className="mt-3 font-display text-2xl font-semibold text-white">
                  {money(o.pricePerNight, request.currency)}
                  <span className="font-sans text-xs font-normal text-white/50"> /night, whole group</span>
                </p>
                <p className="text-xs text-white/45">
                  {money(o.pricePerNight * nights, request.currency)} for {nights} night{nights > 1 ? "s" : ""} · est.
                </p>
                <p className="mt-3 text-sm text-white/70">{o.why}</p>
                <p className="mt-2 text-xs text-white/50">{o.bookingTip}</p>
                <div className="mt-3">
                  {o.verified ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        focusPlace(o);
                        document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline"
                    >
                      <MapPin aria-hidden className="size-3" /> On OpenStreetMap
                    </button>
                  ) : (
                    <Badge tone="neutral" icon={MapPinOff} title="Not matched to a mapped listing — search before booking">
                      verify listing
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
      <p className="mt-4 text-xs text-white/50">
        {stays.note} {places && places.status.staysAndEats !== "ok" && "OpenStreetMap lodging data was unavailable, so options describe areas and types rather than exact listings."}
      </p>
    </Card>
  );
}

function FoodGuide() {
  const food = useTrip((s) => s.plan.food);
  const request = useTrip((s) => s.request);
  if (!food) return <Skeleton className="h-72" />;
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <Utensils aria-hidden className="size-4 text-coral" /> Eat like a local
      </h3>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {food.mustTry.map((d, i) => (
          <motion.li
            key={d.dish}
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{d.dish}</p>
              <span className="text-sm font-semibold whitespace-nowrap text-sun">{money(d.typicalCost, request.currency)}</span>
            </div>
            <p className="mt-1 text-sm text-white/65">{d.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {d.street && <Badge tone="warn">street food</Badge>}
              {d.diet.map((t) => (
                <Badge key={t} tone={/veg|halal|kosher|gluten/i.test(t) ? "good" : "neutral"}>
                  {t}
                </Badge>
              ))}
            </div>
          </motion.li>
        ))}
      </ul>
      <dl className="mt-5 grid gap-4 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-white/50 uppercase">Your diet</dt>
          <dd className="mt-1 text-white/75">{food.dietNotes}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-white/50 uppercase">Water & hygiene</dt>
          <dd className="mt-1 text-white/75">{food.waterAndHygiene}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-white/50 uppercase">Tipping</dt>
          <dd className="mt-1 text-white/75">{food.tipping}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-white/45">Daily meal picks appear inside each itinerary day. Snacks & drinks budgeted at {money(food.snacksPerPersonPerDay, request.currency)} pp/day.</p>
    </Card>
  );
}

function TransportPlan() {
  const t = useTrip((s) => s.plan.transport);
  const request = useTrip((s) => s.request);
  const choices = useTrip((s) => s.choices);
  const setChoices = useTrip((s) => s.setChoices);
  if (!t) return <Skeleton className="h-72" />;
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <Train aria-hidden className="size-4 text-mint" /> Getting there & around
      </h3>
      <p className="mt-1 text-sm text-white/55">From {request.origin} — pick one to update the budget.</p>
      <div role="radiogroup" aria-label="Getting there options" className="mt-4 grid gap-3 md:grid-cols-2">
        {t.gettingThere.map((g, i) => {
          const Icon = MODE_ICON[g.mode] ?? Plane;
          const selected = choices.travelIndex === i;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoices({ travelIndex: i })}
              className={cx("rounded-xl border p-4 text-left transition", selected ? "border-sun/70 bg-sun/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/25")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold text-white capitalize">
                  <Icon aria-hidden className="size-4 text-sun" /> {g.mode}
                  {t.recommended === i && <Badge tone="good">best value</Badge>}
                </span>
                <span className="text-sm font-semibold text-white">{money(g.costPerPersonRoundTrip, request.currency)} pp</span>
              </div>
              <p className="mt-1 text-sm text-white/70">{g.summary}</p>
              <p className="mt-1 text-xs text-white/50">
                {g.durationText} · {g.note}
              </p>
            </button>
          );
        })}
      </div>
      <h4 className="mt-6 text-xs font-semibold tracking-wide text-white/50 uppercase">Local transport</h4>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {t.local.map((l, i) => (
          <li key={i} className="rounded-xl bg-white/[0.03] p-3 text-sm">
            <p className="flex justify-between gap-2 font-medium text-white">
              {l.mode} <span className="text-white/60">{l.typicalCost}</span>
            </p>
            <p className="mt-1 text-white/65">{l.howTo}</p>
            <p className="mt-1 text-xs text-white/45">Best for: {l.bestFor}</p>
          </li>
        ))}
      </ul>
      {t.passes.length > 0 && (
        <>
          <h4 className="mt-6 text-xs font-semibold tracking-wide text-white/50 uppercase">Passes</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {t.passes.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="text-white">{p.name}</span>
                <span className="text-white/55">
                  {money(p.price, request.currency)} · {p.worthIt}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-5 text-sm text-white/65">
        <span className="font-semibold text-white/85">Airport / station transfer: </span>
        {t.airportTransfer}
      </p>
    </Card>
  );
}

export default function TripDetails() {
  const days = useTrip((s) => s.plan.days);
  const [tab, setTab] = useState("stays");
  if (!days.length) return null;
  return (
    <section id="details" aria-labelledby="details-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="details-title" eyebrow="Logistics" title="Stays, food and getting around">
        Three stay options per budget tier, a diet-matched food guide and the best-value way to get there.
      </SectionHeader>
      <Reveal>
        <Tabs
          label="Trip details"
          tabs={[
            { id: "stays", label: "Stays", icon: BedDouble },
            { id: "food", label: "Food", icon: Utensils },
            { id: "transport", label: "Transport", icon: Train },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-4"
        />
        <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "stays" && <Stays />}
          {tab === "food" && <FoodGuide />}
          {tab === "transport" && <TransportPlan />}
        </div>
      </Reveal>
    </section>
  );
}
