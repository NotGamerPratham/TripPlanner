import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, HeartPulse, Luggage, Phone, ShieldCheck, Siren, Handshake } from "lucide-react";
import { readJSON, writeJSON } from "../lib/storage.js";
import { useTrip } from "../store/useTrip.js";
import { Badge, Card, Reveal, SectionHeader, cx } from "./ui.jsx";

function Packing({ packing, tripId }) {
  const key = `waypoint:packing:${tripId}`;
  const [checked, setChecked] = useState(() => readJSON(key, {}));
  useEffect(() => setChecked(readJSON(key, {})), [key]);
  const toggle = (item) =>
    setChecked((c) => {
      const next = { ...c, [item]: !c[item] };
      writeJSON(key, next);
      return next;
    });
  const total = packing.reduce((n, g) => n + g.items.length, 0);
  const done = Object.values(checked).filter(Boolean).length;
  return (
    <Card className="p-6 lg:col-span-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Luggage aria-hidden className="size-4 text-sun" /> Packing list
        </h3>
        <span className="text-xs text-white/55">
          {done}/{total} packed
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {packing.map((g) => (
          <fieldset key={g.category}>
            <legend className="text-xs font-semibold tracking-wide text-white/50 uppercase">{g.category}</legend>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {g.items.map((item) => {
                const id = `${g.category}:${item}`;
                return (
                  <li key={item}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/[0.04]">
                      <input type="checkbox" className="peer sr-only" checked={Boolean(checked[id])} onChange={() => toggle(id)} />
                      <span
                        aria-hidden
                        className={cx(
                          "grid size-4 shrink-0 place-items-center rounded border transition peer-focus-visible:outline-2 peer-focus-visible:outline-sun",
                          checked[id] ? "border-mint bg-mint text-ink-950" : "border-white/25",
                        )}
                      >
                        {checked[id] && <Check className="size-3" />}
                      </span>
                      <span className={cx("text-white/80", checked[id] && "text-white/40 line-through")}>{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/40">Ticks are saved on this device.</p>
    </Card>
  );
}

export default function Essentials() {
  const extras = useTrip((s) => s.plan.extras);
  const live = useTrip((s) => s.live);
  const tripId = useTrip((s) => s.tripId);
  if (!extras) return null;
  const s = extras.safety;
  const liveEmergency = live?.country?.emergency ?? [];

  return (
    <section id="essentials" aria-labelledby="essentials-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="essentials-title" eyebrow="Before you go" title="Pack smart, stay safe">
        Practical prep, scams worth knowing and the numbers to call.
      </SectionHeader>
      <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Packing packing={extras.packing} tripId={tripId ?? "current"} />
        <div className="grid grid-cols-1 gap-4 lg:col-span-7">
          <Card className="border-red-300/20 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Siren aria-hidden className="size-4 text-red-300" /> Emergency numbers
            </h3>
            {liveEmergency.length > 0 ? (
              <>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {liveEmergency.map((e) => (
                    <li key={`${e.number}${e.use}`}>
                      <a href={`tel:${e.number}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 hover:bg-white/[0.08]">
                        <Phone aria-hidden className="size-4 text-red-300" />
                        <span className="font-display text-xl font-semibold text-white">{e.number}</span>
                        <span className="text-xs text-white/60 capitalize">{e.use ?? "emergency"}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-white/45">
                  <Badge tone="good">live</Badge> From Wikidata. {s.emergency.touristPolice ? `Tourist police: ${s.emergency.touristPolice}. ` : ""}
                  {s.emergency.note}
                </p>
              </>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Police", s.emergency.police],
                    ["Ambulance", s.emergency.ambulance],
                    ["Fire", s.emergency.fire],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/[0.04] p-3">
                      <dt className="text-xs text-white/55">{k}</dt>
                      <dd className="font-display text-2xl font-semibold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-amber-200/80">
                  <Badge tone="warn">verify</Badge> Live emergency data was unavailable — these come from Claude's knowledge. {s.emergency.note}
                </p>
              </>
            )}
          </Card>
          <Card className="p-6">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <ShieldCheck aria-hidden className="size-4 text-mint" /> Safety tips
            </h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-white/75">
              {s.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 text-sm text-white/70">
              <HeartPulse aria-hidden className="mt-0.5 size-4 shrink-0 text-coral" />
              {s.health}
            </p>
          </Card>
        </div>

        {s.scams.length > 0 && (
          <Card className="p-6 lg:col-span-7">
            <h3 className="font-semibold text-white">Common scams</h3>
            <ul className="mt-4 space-y-3">
              {s.scams.map((sc, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl bg-white/[0.03] p-3 text-sm"
                >
                  <p className="font-medium text-white">{sc.name}</p>
                  <p className="mt-1 text-white/65">{sc.how}</p>
                  <p className="mt-1 text-emerald-200/85">Avoid it: {sc.avoid}</p>
                </motion.li>
              ))}
            </ul>
          </Card>
        )}
        {extras.etiquette.length > 0 && (
          <Card className="p-6 lg:col-span-5">
            <h3 className="flex items-center gap-2 font-semibold text-white">
              <Handshake aria-hidden className="size-4 text-iris" /> Local etiquette
            </h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-white/75">
              {extras.etiquette.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Card>
        )}
      </Reveal>
    </section>
  );
}
