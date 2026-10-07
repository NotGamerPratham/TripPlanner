import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  Check,
  CloudSun,
  Download,
  KeyRound,
  LoaderCircle,
  PiggyBank,
  Printer,
  RefreshCw,
  Save,
  Share2,
  Square,
  TriangleAlert,
} from "lucide-react";
import { money } from "../lib/format.js";
import { shareUrl } from "../lib/share.js";
import { useBudget, useTrip } from "../store/useTrip.js";
import Itinerary from "./Itinerary.jsx";
import TripMap, { DAY_COLORS } from "./TripMap.jsx";
import { Badge, Button, Card, Reveal, SectionHeader, cx } from "./ui.jsx";

function StreamProgress() {
  const plan = useTrip((s) => s.plan);
  const request = useTrip((s) => s.request);
  const status = useTrip((s) => s.planStatus);
  const mode = useTrip((s) => s.planMode);
  const message = useTrip((s) => s.statusMessage);
  const thinking = useTrip((s) => s.thinking);
  const pending = useTrip((s) => s.pendingSection);
  const cancel = useTrip((s) => s.cancelPlan);
  if (status !== "streaming") return null;
  const items = [
    ["overview", "Overview", Boolean(plan.overview)],
    ...Array.from({ length: request.days }, (_, i) => [`day`, `Day ${i + 1}`, plan.days.some((d) => d.day === i + 1)]),
    ["stays", "Stays", Boolean(plan.stays)],
    ["food", "Food", Boolean(plan.food)],
    ["transport", "Transport", Boolean(plan.transport)],
    ...(mode === "plan" ? [["extras", "Essentials", Boolean(plan.extras)]] : []),
  ];
  return (
    <Card strong className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-white" role="status" aria-live="polite">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-sun" />
          {message || "Working…"}
        </p>
        <Button size="sm" variant="subtle" icon={Square} onClick={cancel}>
          Stop
        </Button>
      </div>
      <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Plan sections">
        {items.map(([key, label, done]) => {
          const active = !done && pending === key;
          return (
            <li
              key={label}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                done ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : active ? "border-sun/50 bg-sun/10 text-white" : "border-white/10 text-white/45",
              )}
            >
              {done ? <Check aria-hidden className="size-3" /> : active ? <LoaderCircle aria-hidden className="size-3 animate-spin" /> : null}
              {label}
              <span className="sr-only">{done ? " ready" : " pending"}</span>
            </li>
          );
        })}
      </ol>
      <AnimatePresence mode="wait">
        {thinking && (
          <motion.p
            key={thinking.slice(0, 24)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-start gap-2 text-xs text-white/50 italic"
            aria-hidden
          >
            <BrainCircuit className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{thinking}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Overview() {
  const o = useTrip((s) => s.plan.overview);
  if (!o) return null;
  return (
    <Reveal>
      <Card className="relative mb-6 overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-20 -left-20 size-64 rounded-full bg-iris/20 blur-3xl" />
        <h3 className="relative font-display text-3xl font-semibold text-white sm:text-4xl">{o.title}</h3>
        <p className="relative mt-2 text-lg text-sun/90">{o.tagline}</p>
        <p className="relative mt-4 max-w-3xl leading-relaxed text-white/75">{o.summary}</p>
        <div className="relative mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white/[0.04] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/55 uppercase">
              <CloudSun aria-hidden className="size-4 text-sky" /> Weather strategy
            </p>
            <p className="mt-1.5 text-sm text-white/80">{o.weatherStrategy}</p>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/55 uppercase">
              <PiggyBank aria-hidden className="size-4 text-mint" /> Budget verdict
            </p>
            <p className="mt-1.5 text-sm text-white/80">{o.budgetVerdict}</p>
          </div>
        </div>
        {o.bestAreasToStay?.length > 0 && (
          <p className="relative mt-4 text-sm text-white/65">
            <span className="font-semibold text-white/85">Best bases: </span>
            {o.bestAreasToStay.join(" · ")}
          </p>
        )}
        {o.dataGaps?.length > 0 && (
          <div className="relative mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-200 uppercase">
              <TriangleAlert aria-hidden className="size-4" /> Verify before you go
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/75">
              {o.dataGaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </Reveal>
  );
}

function ActionBar() {
  const status = useTrip((s) => s.planStatus);
  const runPlan = useTrip((s) => s.runPlan);
  const optimizeWeather = useTrip((s) => s.optimizeWeather);
  const saveCurrent = useTrip((s) => s.saveCurrent);
  const snapshot = useTrip((s) => s.snapshot);
  const toast = useTrip((s) => s.toast);
  const request = useTrip((s) => s.request);
  const budget = useBudget();
  const [busy, setBusy] = useState(null);
  const streaming = status === "streaming";

  const onWeather = () => {
    const r = optimizeWeather();
    if (!r.ok) return toast(r.message, "info");
    toast(`Re-ordered ${r.changes.length} day${r.changes.length > 1 ? "s" : ""}: outdoor days moved to drier dates.`, "good");
  };
  const onShare = async () => {
    setBusy("share");
    try {
      const url = await shareUrl(snapshot());
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "My Waypoint trip", url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        toast(url.length > 8000 ? "Link copied (it's long — the whole trip lives inside it)." : "Share link copied to clipboard.", "good");
      }
    } catch {
      toast("Couldn't create a share link in this browser.", "bad");
    } finally {
      setBusy(null);
    }
  };
  const onPdf = async () => {
    setBusy("pdf");
    try {
      const { exportPdf } = await import("../lib/pdf.js");
      const s = useTrip.getState();
      await exportPdf({ ...snapshot(), live: s.live, budget });
    } catch (err) {
      console.error(err);
      toast("PDF export failed — try Print instead.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="no-print sticky top-[4.25rem] z-20 mb-6">
      <div className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl p-2 shadow-xl">
        {budget && (
          <p className="hidden px-3 text-sm md:block">
            <span className="text-white/55">Total </span>
            <span className={cx("font-semibold", budget.remaining < 0 ? "text-red-200" : "text-white")}>{money(budget.total, request.currency)}</span>
            <span className="text-white/45"> / {money(budget.budget, request.currency)}</span>
          </p>
        )}
        <div className="flex flex-1 flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="primary" icon={PiggyBank} disabled={streaming} onClick={() => runPlan("cheaper")}>
            Make it cheaper
          </Button>
          <Button size="sm" icon={CloudSun} disabled={streaming} onClick={onWeather}>
            Fit to weather
          </Button>
          <Button
            size="sm"
            icon={Save}
            disabled={streaming}
            onClick={() => {
              const ok = saveCurrent();
              toast(ok ? "Saved to My trips on this device." : "Couldn't save — browser storage is blocked.", ok ? "good" : "bad");
            }}
          >
            Save
          </Button>
          <Button size="sm" icon={busy === "share" ? LoaderCircle : Share2} disabled={streaming || busy} onClick={onShare}>
            Share
          </Button>
          <Button size="sm" icon={busy === "pdf" ? LoaderCircle : Download} disabled={streaming || busy} onClick={onPdf}>
            PDF
          </Button>
          <Button size="sm" variant="subtle" icon={Printer} disabled={streaming} onClick={() => window.print()} aria-label="Print">
            <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SavingsBanner() {
  const savings = useTrip((s) => s.savings);
  const request = useTrip((s) => s.request);
  if (!savings) return null;
  const diff = savings.before - savings.after;
  const pct = savings.before ? Math.round((diff / savings.before) * 100) : 0;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6" role="status">
      <Card className="flex flex-wrap items-center gap-3 border-emerald-300/30 p-4">
        <PiggyBank aria-hidden className="size-5 text-emerald-300" />
        <p className="text-sm text-white/85">
          {diff > 0 ? (
            <>
              New plan saves <strong className="text-emerald-200">{money(diff, request.currency)}</strong> ({pct}%) —{" "}
              {money(savings.before, request.currency)} → {money(savings.after, request.currency)}.
            </>
          ) : (
            <>This plan was already lean — Claude couldn't find meaningful savings without cutting highlights.</>
          )}
        </p>
      </Card>
    </motion.div>
  );
}

function DayPicker() {
  const days = useTrip((s) => s.plan.days);
  const active = useTrip((s) => s.activeDayKey);
  const setActive = useTrip((s) => s.setActiveDay);
  const routes = useTrip((s) => s.routes);
  const activeRoute = routes[active];
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-3">
      {days.map((d, i) => (
        <button
          key={d.key}
          type="button"
          onClick={() => setActive(d.key)}
          aria-pressed={d.key === active}
          className={cx("rounded-full border px-2.5 py-1 text-xs transition", d.key === active ? "border-transparent text-ink-950" : "border-white/12 text-white/70 hover:text-white")}
          style={d.key === active ? { background: DAY_COLORS[i % DAY_COLORS.length] } : undefined}
        >
          Day {d.day}
        </button>
      ))}
      {activeRoute?.status === "ok" && (
        <Badge tone="neutral" className="ml-auto">
          {activeRoute.data.distanceKm} km · {activeRoute.data.profile === "foot" ? "walking" : "by road"} route
        </Badge>
      )}
      {activeRoute?.status === "loading" && (
        <Badge tone="neutral" className="ml-auto">
          routing…
        </Badge>
      )}
      {activeRoute?.status === "error" && (
        <Badge tone="warn" className="ml-auto" title={activeRoute.error}>
          routing unavailable · straight lines
        </Badge>
      )}
    </div>
  );
}

export default function PlanSection() {
  const request = useTrip((s) => s.request);
  const health = useTrip((s) => s.health);
  const status = useTrip((s) => s.planStatus);
  const error = useTrip((s) => s.planError);
  const days = useTrip((s) => s.plan.days);
  const runPlan = useTrip((s) => s.runPlan);
  const mode = useTrip((s) => s.planMode);
  if (!request) return null;
  const hasPlan = days.length > 0;
  const notConfigured = health && !health.ai && !hasPlan;

  return (
    <section id="itinerary" aria-labelledby="itinerary-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="itinerary-title" eyebrow="Step 4 · Your plan" title="Day by day, built around the forecast">
        Drag stops to reorder or move them between days — times, travel and costs update instantly. Tap a day to see its route.
      </SectionHeader>

      {notConfigured && (
        <Card className="p-6">
          <p className="flex items-center gap-2 font-semibold text-white">
            <KeyRound aria-hidden className="size-5 text-sun" /> Connect Claude to generate the itinerary
          </p>
          <p className="mt-2 max-w-2xl text-sm text-white/70">
            Add <code className="rounded bg-white/10 px-1.5 py-0.5">ANTHROPIC_API_KEY=…</code> to the <code className="rounded bg-white/10 px-1.5 py-0.5">.env</code>{" "}
            file next to <code className="rounded bg-white/10 px-1.5 py-0.5">package.json</code> and restart <code className="rounded bg-white/10 px-1.5 py-0.5">npm run dev</code>.
            The key stays on the Node server; the browser never sees it. Live conditions, places and the map above already work without it.
          </p>
        </Card>
      )}

      <StreamProgress />

      {status === "error" && !notConfigured && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-red-300/25 p-5" role="alert">
          <p className="flex items-start gap-2 text-sm text-red-100">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
          <Button size="sm" icon={RefreshCw} onClick={() => runPlan(hasPlan && mode === "cheaper" ? "cheaper" : "plan")}>
            Try again
          </Button>
        </Card>
      )}

      <SavingsBanner />
      <Overview />
      {hasPlan && <ActionBar />}

      {(hasPlan || status === "streaming") && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Itinerary />
          </div>
          <div className="lg:col-span-5">
            <Card className="overflow-hidden lg:sticky lg:top-[8.5rem]">
              <DayPicker />
              <div className="h-[380px] lg:h-[calc(100vh-14rem)] lg:max-h-[640px]">
                <TripMap mode="plan" label="Map of the selected day's route" />
              </div>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
