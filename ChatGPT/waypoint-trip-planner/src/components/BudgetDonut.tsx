import type { DayPlan } from '../types';
import { money } from '../lib/format';

export default function BudgetDonut({ days, budget, currency }: { days: DayPlan[]; budget: number; currency: string }) {
  const categories = [
    { label: 'Activities', value: days.reduce((s, d) => s + d.activities.reduce((a, x) => a + x.entryFee.amount, 0), 0) },
    { label: 'Food', value: days.reduce((s, d) => s + d.food.reduce((a, x) => a + x.estimatedCost.amount, 0), 0) },
    { label: 'Daily spend', value: days.reduce((s, d) => s + Math.max(0, d.estimatedDailyCost - d.activities.reduce((a, x) => a + x.entryFee.amount, 0) - d.food.reduce((a, x) => a + x.estimatedCost.amount, 0)), 0) },
  ];
  const total = categories.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  const circumference = 2 * Math.PI * 42;
  const segments = categories.map((x) => {
    const dash = total ? (x.value / total) * circumference : 0;
    const item = { ...x, dash, offset };
    offset += dash;
    return item;
  });
  const planned = days.reduce((s, x) => s + x.estimatedDailyCost, 0);
  const buffered = planned * 1.1;

  return (
    <section className="glass-panel p-5">
      <div className="flex items-center justify-between"><div><p className="eyebrow">Budget</p><h2 className="mt-1 text-xl font-semibold">Live cost picture</h2></div><span className="text-sm text-white/50">+10% buffer</span></div>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="relative h-44 w-44 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-label="Budget breakdown donut chart">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="12" />
            {segments.map((s) => <circle key={s.label} cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="12" strokeDasharray={`${s.dash} ${circumference - s.dash}`} strokeDashoffset={-s.offset} pathLength={circumference} />)}
          </svg>
          <div className="absolute inset-0 grid place-items-center"><div className="text-center"><div className="text-2xl font-semibold">{money(buffered, currency)}</div><div className="text-xs text-white/50">with buffer</div></div></div>
        </div>
        <div className="grid flex-1 gap-3">
          {categories.map((x) => <div key={x.label} className="flex items-center justify-between text-sm"><span className="text-white/60">{x.label}</span><span>{money(x.value, currency)}</span></div>)}
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3 text-sm"><span className="text-white/60">Planned</span><span>{money(planned, currency)}</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-white/60">Your cap</span><span>{money(budget, currency)}</span></div>
        </div>
      </div>
    </section>
  );
}
