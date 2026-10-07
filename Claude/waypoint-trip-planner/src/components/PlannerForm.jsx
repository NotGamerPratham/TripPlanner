import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Backpack, Crown, Hotel, LoaderCircle, Minus, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { CURRENCIES, FOOD_PREFS, INTERESTS, TRANSPORT_PREFS, TripRequestSchema } from "../../shared/schema.js";
import { getJSON } from "../lib/api.js";
import { addDaysISO, todayISO } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";
import DestinationSearch, { placeLabel } from "./DestinationSearch.jsx";
import { Button, Card, Chip, Reveal, SectionHeader, cx } from "./ui.jsx";

const STYLES = [
  { id: "backpacker", label: "Backpacker", icon: Backpack, hint: "Hostels, street food, transit" },
  { id: "mid", label: "Mid-range", icon: Hotel, hint: "Comfort without splurging" },
  { id: "luxury", label: "Luxury", icon: Crown, hint: "Signature stays & dining" },
];

const DIET_EXCLUSIVE = new Set(["Vegetarian", "Vegan", "Halal", "Kosher", "Gluten-free"]);

function Stepper({ id, value, min, max, onChange, label }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-10 place-items-center rounded-xl border border-white/12 bg-white/[0.04] hover:bg-white/10 disabled:opacity-40"
        disabled={value <= min}
      >
        <Minus className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="field w-16 text-center"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-10 place-items-center rounded-xl border border-white/12 bg-white/[0.04] hover:bg-white/10 disabled:opacity-40"
        disabled={value >= max}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function ChipGroup({ label, options, value, onToggle }) {
  const id = useId();
  return (
    <fieldset>
      <legend id={id} className="label">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <Chip key={o} selected={value.includes(o)} onClick={() => onToggle(o)}>
            {o}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export default function PlannerForm() {
  const form = useTrip((s) => s.form);
  const setForm = useTrip((s) => s.setForm);
  const startTrip = useTrip((s) => s.startTrip);
  const health = useTrip((s) => s.health);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const toggle = (key, item) => {
    const cur = form[key];
    let next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
    if (key === "food") {
      if (item === "No restrictions" && !cur.includes(item)) next = next.filter((x) => !DIET_EXCLUSIVE.has(x));
      if (DIET_EXCLUSIVE.has(item) && !cur.includes(item)) next = next.filter((x) => x !== "No restrictions");
    }
    setForm({ [key]: next });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      let destination = form.destination;
      if (!destination && form.query.trim().length >= 2) {
        const { results } = await getJSON("/api/geocode", { q: form.query.trim() });
        destination = results[0] ?? null;
        if (destination) setForm({ destination, query: placeLabel(destination) });
      }
      if (!destination) {
        setErrors({ destination: "Pick a destination from the suggestions." });
        return;
      }
      let originPlace = null;
      if (form.origin.trim().length >= 2) {
        originPlace = await getJSON("/api/geocode", { q: form.origin.trim() })
          .then((r) => r.results[0] ?? null)
          .catch(() => null);
      }
      const strip = ({ id, population, ...rest }) => rest; // eslint-disable-line no-unused-vars
      const candidate = {
        destination: strip(destination),
        origin: form.origin.trim() || "Not specified",
        originPlace: originPlace ? strip(originPlace) : null,
        startDate: form.startDate,
        days: Number(form.days),
        travelers: Number(form.travelers),
        budget: Number(form.budget),
        currency: form.currency,
        style: form.style,
        interests: form.interests,
        food: form.food,
        transport: form.transport,
        notes: form.notes.trim(),
      };
      const parsed = TripRequestSchema.safeParse(candidate);
      if (!parsed.success) {
        const errs = {};
        for (const issue of parsed.error.issues) errs[issue.path[0]] = issue.message;
        setErrors(errs);
        return;
      }
      if (parsed.data.startDate < todayISO()) {
        setErrors({ startDate: "Pick today or a future date." });
        return;
      }
      startTrip(parsed.data);
      requestAnimationFrame(() => document.getElementById("live")?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const err = (k) =>
    errors[k] && (
      <p id={`err-${k}`} className="mt-1 text-xs text-red-300">
        {errors[k]}
      </p>
    );

  return (
    <section id="plan" aria-labelledby="plan-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <SectionHeader id="plan-title" eyebrow="Step 1 · Your trip" title="Where to, and how do you travel?">
        Tell us the basics. We check what's happening there right now before a single stop is planned.
      </SectionHeader>

      <Reveal>
        <Card className="p-5 sm:p-8">
          <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <label htmlFor="destination" className="label">
                Destination
              </label>
              <DestinationSearch
                id="destination"
                value={form.query}
                selected={form.destination}
                placeholder="City or region — e.g. Kyoto, Lisbon, Jaipur"
                onQueryChange={(query) => setForm({ query, destination: form.destination && placeLabel(form.destination) === query ? form.destination : null })}
                onSelect={(destination) => setForm({ destination, query: placeLabel(destination) })}
                invalid={Boolean(errors.destination)}
                describedBy={errors.destination ? "err-destination" : undefined}
              />
              {err("destination")}
            </div>
            <div className="lg:col-span-5">
              <label htmlFor="origin" className="label">
                Starting from
              </label>
              <input
                id="origin"
                className="field"
                placeholder="Your home city"
                value={form.origin}
                onChange={(e) => setForm({ origin: e.target.value })}
                autoComplete="address-level2"
              />
            </div>

            <div className="sm:col-span-1 lg:col-span-4">
              <label htmlFor="startDate" className="label">
                Start date
              </label>
              <input
                id="startDate"
                type="date"
                className="field"
                min={todayISO()}
                max={addDaysISO(todayISO(), 540)}
                value={form.startDate}
                onChange={(e) => setForm({ startDate: e.target.value })}
                aria-invalid={Boolean(errors.startDate) || undefined}
              />
              {err("startDate")}
            </div>
            <div className="lg:col-span-4">
              <label htmlFor="days" className="label">
                Days
              </label>
              <Stepper id="days" label="days" min={1} max={14} value={form.days} onChange={(days) => setForm({ days })} />
            </div>
            <div className="lg:col-span-4">
              <label htmlFor="travelers" className="label">
                Travelers
              </label>
              <Stepper id="travelers" label="travelers" min={1} max={12} value={form.travelers} onChange={(travelers) => setForm({ travelers })} />
            </div>

            <div className="lg:col-span-5">
              <label htmlFor="budget" className="label">
                Total budget (whole group)
              </label>
              <div className="flex gap-2">
                <input
                  id="budget"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  className="field"
                  value={form.budget}
                  onChange={(e) => setForm({ budget: e.target.value === "" ? "" : Number(e.target.value) })}
                  aria-invalid={Boolean(errors.budget) || undefined}
                />
                <label htmlFor="currency" className="sr-only">
                  Currency
                </label>
                <select id="currency" className="field w-28" value={form.currency} onChange={(e) => setForm({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} className="bg-ink-900">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {err("budget")}
            </div>

            <fieldset className="lg:col-span-7">
              <legend className="label">Travel style</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {STYLES.map((s) => {
                  const active = form.style === s.id;
                  return (
                    <label
                      key={s.id}
                      className={cx(
                        "relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sun",
                        active ? "border-sun/70 bg-sun/10" : "border-white/12 bg-white/[0.03] hover:border-white/25",
                      )}
                    >
                      <input type="radio" name="style" value={s.id} checked={active} onChange={() => setForm({ style: s.id })} className="sr-only" />
                      <s.icon aria-hidden className={cx("mt-0.5 size-5", active ? "text-sun" : "text-white/55")} />
                      <span>
                        <span className="block text-sm font-semibold text-white">{s.label}</span>
                        <span className="block text-xs text-white/55">{s.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="lg:col-span-12">
              <ChipGroup label="Interests" options={INTERESTS} value={form.interests} onToggle={(o) => toggle("interests", o)} />
            </div>
            <div className="lg:col-span-6">
              <ChipGroup label="Food" options={FOOD_PREFS} value={form.food} onToggle={(o) => toggle("food", o)} />
            </div>
            <div className="lg:col-span-6">
              <ChipGroup label="Getting around" options={TRANSPORT_PREFS} value={form.transport} onToggle={(o) => toggle("transport", o)} />
            </div>

            <div className="lg:col-span-12">
              <label htmlFor="notes" className="label">
                Anything else? <span className="font-normal tracking-normal normal-case text-white/40">(optional)</span>
              </label>
              <textarea
                id="notes"
                rows={2}
                maxLength={500}
                className="field resize-y"
                placeholder="e.g. travelling with a toddler, love sunrise hikes, avoid long drives"
                value={form.notes}
                onChange={(e) => setForm({ notes: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
              <AnimatePresence>
                {health && !health.ai ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 text-sm text-amber-200/90"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    Claude isn't configured on the server (no ANTHROPIC_API_KEY). You'll still get live conditions, places and the map.
                  </motion.p>
                ) : (
                  <p className="text-sm text-white/50">Costs are estimates. Live sources and their status are shown with every result.</p>
                )}
              </AnimatePresence>
              {err("form")}
              <Button type="submit" variant="primary" size="lg" icon={submitting ? LoaderCircle : Sparkles} disabled={submitting} className={submitting ? "[&>svg]:animate-spin" : ""}>
                {submitting ? "Locating…" : "Build my plan"}
              </Button>
            </div>
          </form>
        </Card>
      </Reveal>
    </section>
  );
}
