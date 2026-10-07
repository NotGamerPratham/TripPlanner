import { useState } from "react";
import { motion } from "framer-motion";
import { CircleCheck, Lightbulb, PiggyBank, TriangleAlert } from "lucide-react";
import { money } from "../lib/format.js";
import { useBudget, useTrip } from "../store/useTrip.js";
import AnimatedNumber from "./AnimatedNumber.jsx";
import { Button, Card, Reveal, SectionHeader, cx } from "./ui.jsx";

const R = 76;
const C = 2 * Math.PI * R;
const GAP = 2.5; // surface gap between segments

function Donut({ categories, total, currency, hovered, setHovered }) {
  let offset = 0;
  const segments = categories
    .filter((c) => c.value > 0)
    .map((c) => {
      const len = total > 0 ? (c.value / total) * C : 0;
      const seg = { ...c, dash: Math.max(0.01, len - GAP), offset };
      offset += len;
      return seg;
    });
  const focus = hovered ? categories.find((c) => c.id === hovered) : null;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Budget breakdown donut: total ${money(total, currency)}. See the table for values.`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="24" />
        {segments.map((s, i) => (
          <motion.circle
            key={s.id}
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={hovered === s.id ? 28 : 24}
            transform="rotate(-90 100 100)"
            initial={{ strokeDasharray: `0 ${C}`, strokeDashoffset: 0 }}
            animate={{ strokeDasharray: `${s.dash} ${C - s.dash}`, strokeDashoffset: -s.offset, opacity: hovered && hovered !== s.id ? 0.35 : 1 }}
            transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xs text-white/55">{focus ? focus.label : "Estimated total"}</p>
          <p className="font-display text-3xl font-semibold text-white">
            <AnimatedNumber value={focus ? focus.value : total} format={(v) => money(v, currency)} />
          </p>
          {focus && <p className="text-xs text-white/55">{total ? Math.round((focus.value / total) * 100) : 0}% of total</p>}
        </div>
      </div>
    </div>
  );
}

export default function BudgetPanel() {
  const request = useTrip((s) => s.request);
  const plan = useTrip((s) => s.plan);
  const status = useTrip((s) => s.planStatus);
  const runPlan = useTrip((s) => s.runPlan);
  const budget = useBudget();
  const [hovered, setHovered] = useState(null);
  if (!request || !plan.days.length || !budget) return null;
  const cur = request.currency;
  const over = budget.remaining < 0;
  const pct = Math.min(1.5, budget.pctUsed);
  const tone = over ? (budget.pctUsed > 1.1 ? "bad" : "warn") : "good";

  return (
    <section id="budget" aria-labelledby="budget-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="budget-title" eyebrow="Money" title="Where the money goes">
        Every number is derived from the plan above, so it moves as you drag, skip or swap stops. A 10% buffer is always included.
      </SectionHeader>
      <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-5">
          <Donut categories={budget.categories} total={budget.total} currency={cur} hovered={hovered} setHovered={setHovered} />
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-white/60">Budget {money(budget.budget, cur)}</span>
              <span className={cx("flex items-center gap-1 font-semibold", tone === "good" ? "text-emerald-200" : tone === "warn" ? "text-amber-200" : "text-red-200")}>
                {over ? <TriangleAlert aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
                {over ? `${money(-budget.remaining, cur)} over` : `${money(budget.remaining, cur)} to spare`}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budget.pctUsed * 100)} aria-label="Share of budget used">
              <motion.div
                className={cx("h-full rounded-full", tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-red-400")}
                animate={{ width: `${Math.min(100, pct * 100)}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <p className="mt-3 text-sm text-white/60">
              {money(budget.perPerson, cur)} per person · {budget.nights} night{budget.nights > 1 ? "s" : ""}
              {!budget.complete && " · some sections still loading"}
            </p>
            {over && (
              <Button className="mt-4" variant="primary" icon={PiggyBank} disabled={status === "streaming"} onClick={() => runPlan("cheaper")}>
                Make it cheaper
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-x-auto p-6 lg:col-span-7">
          <table className="w-full text-sm">
            <caption className="sr-only">Budget breakdown by category</caption>
            <thead>
              <tr className="text-left text-xs tracking-wide text-white/50 uppercase">
                <th scope="col" className="pb-3 font-semibold">
                  Category
                </th>
                <th scope="col" className="pb-3 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="pb-3 text-right font-semibold">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {budget.categories.map((c) => (
                <tr
                  key={c.id}
                  className={cx("border-t border-white/8 transition", hovered === c.id && "bg-white/[0.04]")}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(c.id)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                >
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: c.color }} />
                      <span>
                        <span className="block font-medium text-white">{c.label}</span>
                        <span className="block text-xs text-white/50">{c.note}</span>
                      </span>
                    </span>
                  </th>
                  <td className="py-3 text-right font-semibold whitespace-nowrap text-white">
                    <AnimatedNumber value={c.value} format={(v) => money(v, cur)} />
                  </td>
                  <td className="py-3 pl-3 text-right whitespace-nowrap text-white/60">{budget.total ? Math.round((c.value / budget.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/20">
                <th scope="row" className="pt-3 text-left font-semibold text-white">
                  Total
                </th>
                <td className="pt-3 text-right font-display text-lg font-semibold text-white">
                  <AnimatedNumber value={budget.total} format={(v) => money(v, cur)} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="mt-4 text-xs text-white/45">All amounts are AI estimates in {cur}; check live prices before booking.</p>
        </Card>

        {plan.extras?.moneyHacks?.length > 0 && (
          <Card className="p-6 lg:col-span-12">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Lightbulb aria-hidden className="size-4 text-sun" /> Money-saving hacks
            </h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {plan.extras.moneyHacks.map((h, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                  className="flex gap-3 rounded-xl bg-white/[0.03] p-3 text-sm"
                >
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-200 self-start">{h.saves}</span>
                  <span className="text-white/80">{h.hack}</span>
                </motion.li>
              ))}
            </ul>
          </Card>
        )}
      </Reveal>
    </section>
  );
}
