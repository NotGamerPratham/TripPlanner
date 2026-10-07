import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import PlannerForm from './components/PlannerForm';
import RightNowCard from './components/RightNowCard';
import BudgetDonut from './components/BudgetDonut';
import ItineraryBoard from './components/ItineraryBoard';
import MapPanel from './components/MapPanel';
import ChatAssistant from './components/ChatAssistant';
import type { GeoLocation, ItineraryPlan, LiveContext, PlannerInput, StreamEvent } from './types';
import { geocode, getContext, streamPlan } from './lib/api';
import { money } from './lib/format';
import { hydrateEmergencyDefaults } from './lib/itinerary';

export default function App() {
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('Waiting for trip inputs');
  const [context, setContext] = useState<LiveContext | null>(null);
  const [destination, setDestination] = useState<GeoLocation | null>(null);
  const [plan, setPlan] = useState<ItineraryPlan | null>(() => loadSaved());
  const [input, setInput] = useState<PlannerInput | null>(null);

  async function buildTrip(plannerInput: PlannerInput, mode: 'create' | 'cheaper' = 'create') {
    setLoading(true);
    setInput(plannerInput);
    setStage('Resolving destination');
    try {
      const geo = destination?.name === plannerInput.destination ? destination : await geocode(plannerInput.destination);
      const live = await getContext(plannerInput, geo);
      setDestination(geo); setContext(live); setStage('Claude is shaping the day order');
      await streamPlan(plannerInput, live, (event: StreamEvent) => {
        if (event.type === 'status' && event.message) setStage(event.message);
        if (event.type === 'section') {
          setStage(`Loaded ${String(event.section)}`);
          if (event.section === 'days' && event.payload) setPlan((prev) => ({ ...(prev ?? emptyPlan(plannerInput, geo)), days: event.payload as ItineraryPlan['days'] }));
          if (event.section !== 'days' && event.payload) setPlan((prev) => hydrateEmergencyDefaults({ ...(prev ?? emptyPlan(plannerInput, geo)), [event.section as string]: event.payload } as ItineraryPlan, live));
        }
        if (event.type === 'complete' && event.payload) setPlan(hydrateEmergencyDefaults(event.payload as ItineraryPlan, live));
        if (event.type === 'error') setStage(event.message ?? 'Failed');
      }, mode, mode === 'cheaper' ? plan ?? undefined : undefined);
    } catch (error) {
      setStage(error instanceof Error ? error.message : 'Failed to build trip');
    } finally { setLoading(false); }
  }

  const totalPlanned = useMemo(() => plan?.days.reduce((s, x) => s + x.estimatedDailyCost, 0) ?? 0, [plan]);

  function savePlan() {
    if (!plan || !context || !input) return;
    localStorage.setItem('waypoint-plan', JSON.stringify({ plan, context, destination, input }));
    setStage('Saved locally in this browser');
  }

  async function sharePlan() {
    if (!plan) return;
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(plan))));
    const url = `${location.origin}${location.pathname}#plan=${payload}`;
    await navigator.clipboard?.writeText(url);
    setStage('Share link copied');
  }

  return <main>
    <section className="hero-shell">
      <motion.div initial={reduced ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="hero-copy"><div className="eyebrow">WAYPOINT / LIVE TRIP ENGINE</div><h1>Plan around the day you will actually get.</h1><p>Weather first. Reality second. Budget always visible.</p><div className="hero-meta"><span>Open-Meteo</span><span>OpenStreetMap</span><span>Claude structured output</span><span>OSRM routing</span></div></motion.div>
      <motion.div initial={reduced ? false : { opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: .1 }} className="hero-card"><div className="orb orb-a"/><div className="orb orb-b"/><div className="hero-grid"/><div className="relative z-10"><div className="text-sm uppercase tracking-[0.22em] text-white/40">Current design brief</div><div className="mt-4 max-w-lg text-3xl font-medium leading-tight">A trip planner that treats live conditions as constraints, not decoration.</div><div className="mt-6 grid gap-3 text-sm text-white/60 sm:grid-cols-2"><div className="info-tile">Reorders days around forecast quality</div><div className="info-tile">Adds rain Plan B paths</div><div className="info-tile">Clusters nearby places into short routes</div><div className="info-tile">Keeps unknown data explicitly unknown</div></div></div></motion.div>
    </section>

    <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8"><PlannerForm loading={loading} onSubmit={(x) => buildTrip(x)} />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-white/55"><span aria-live="polite">{stage}</span>{plan && <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={savePlan}>Save</button><button className="secondary-button" onClick={sharePlan}>Share</button><button className="secondary-button" onClick={() => input && buildTrip(input, 'cheaper')}>Make it cheaper</button><button className="secondary-button" onClick={() => printPdf(plan)}>Export PDF</button><span className="pill">Planned {money(totalPlanned, plan.currency)}</span></div>}</div>
    </section>

    <AnimatePresence>
      {plan && context && <motion.section initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-7xl space-y-6 px-4 pb-24 md:px-8">
        <RightNowCard context={context} />
        <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]"><ItineraryBoard plan={plan} onPlanChange={setPlan} /><BudgetDonut days={plan.days} budget={plan.totalBudget} currency={plan.currency} /></div>
        <MapPanel plan={plan} context={context} />
        <div className="grid gap-6 lg:grid-cols-2"><StayCards plan={plan} /><UtilityCards plan={plan} /></div>
        <ChatAssistant plan={plan} context={context} />
      </motion.section>}
    </AnimatePresence>
  </main>;
}

function StayCards({ plan }: { plan: ItineraryPlan }) {
  return <section className="glass-panel p-5"><p className="eyebrow">Stay field</p><h2 className="mt-1 text-xl font-semibold">3 options per tier when source data allows</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{plan.stays.slice(0, 9).map((stay) => <div key={stay.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-[0.16em] text-white/40">{stay.tier}</div><div className="mt-2 font-medium">{stay.name}</div><div className="mt-1 text-sm text-white/55">{stay.location}</div><div className="mt-4 text-sm">{stay.nightly.status === 'verified' ? money(stay.nightly.amount, stay.nightly.currency) : 'Rate unavailable'}</div><p className="mt-2 text-xs leading-5 text-white/40">{stay.notes}</p></div>)}{plan.stays.length === 0 && <div className="text-sm text-white/50">No rate source returned stays. Connect a hotel provider for verified prices.</div>}</div></section>;
}

function UtilityCards({ plan }: { plan: ItineraryPlan }) {
  return <div className="grid gap-6"><section className="glass-panel p-5"><p className="eyebrow">Practical layer</p><h2 className="mt-1 text-xl font-semibold">Transport, packing, safety</h2><div className="mt-5 grid gap-4 md:grid-cols-3"><Box title="Transport" items={plan.transportPlan} /><Box title="Packing" items={plan.packingList} /><Box title="Safety" items={plan.safetyTips} /></div></section><section className="glass-panel p-5"><p className="eyebrow">Emergency</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{plan.emergencyNumbers.map((x) => <div key={`${x.label}-${x.number}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-sm font-medium">{x.label}</div><div className="mt-1 text-lg">{x.status === 'verified' ? x.number : 'Unknown'}</div><div className="text-xs text-white/40">{x.source}</div></div>)}</div></section></div>;
}

function Box({ title, items }: { title: string; items: string[] }) {
  return <div><div className="text-sm font-medium">{title}</div><ul className="mt-3 space-y-2 text-sm text-white/60">{items.slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul></div>;
}

function emptyPlan(input: PlannerInput, geo: GeoLocation): ItineraryPlan {
  return { title: `${geo.name} situational trip`, summary: '', destination: geo.name, currency: input.currency, travelers: input.travelers, totalBudget: input.budget, bufferPercent: 10, stays: [], days: [], transportPlan: [], moneySavingHacks: [], packingList: [], safetyTips: [], emergencyNumbers: [], sources: [] };
}

function loadSaved(): ItineraryPlan | null {
  try {
    const raw = localStorage.getItem('waypoint-plan');
    return raw ? JSON.parse(raw).plan as ItineraryPlan : null;
  } catch { return null; }
}

function printPdf(plan: ItineraryPlan) {
  // The full export is implemented server-agnostically in the browser so it works offline after a plan is generated.
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(plan.title, 14, 18);
    doc.setFontSize(10); doc.text(`${plan.destination} | ${plan.travelers} travelers | Budget ${money(plan.totalBudget, plan.currency)}`, 14, 26);
    let y = 38;
    plan.days.forEach((day) => {
      if (y > 270) { doc.addPage(); y = 18; }
      doc.setFontSize(13); doc.text(`Day ${day.day} · ${day.date} · ${day.theme}`, 14, y); y += 7;
      doc.setFontSize(9);
      day.activities.forEach((a) => { if (y > 285) { doc.addPage(); y = 18; } doc.text(`${a.start} ${a.title} — ${a.location}`, 16, y); y += 5; });
      y += 4;
    });
    doc.save('waypoint-trip-plan.pdf');
  });
}
