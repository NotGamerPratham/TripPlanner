import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Banknote,
  CalendarHeart,
  CheckCircle2,
  Clock,
  Droplets,
  Globe,
  History,
  Info,
  Languages,
  Sunrise,
  Sunset,
  ShieldAlert,
  Ticket,
  TriangleAlert,
  Users,
  Wind,
} from "lucide-react";
import { wmoLabel } from "../../shared/weather.js";
import { clock, fmtDate, localTimeIn, safeUrl } from "../lib/format.js";
import { useTrip } from "../store/useTrip.js";
import { Badge, Card, Reveal, SectionHeader, Skeleton, Unavailable, WeatherIcon, cx } from "./ui.jsx";

function aqiInfo(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return { label: "Good", tone: "good" };
  if (aqi <= 100) return { label: "Moderate", tone: "warn" };
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", tone: "warn" };
  if (aqi <= 200) return { label: "Unhealthy", tone: "bad" };
  if (aqi <= 300) return { label: "Very unhealthy", tone: "bad" };
  return { label: "Hazardous", tone: "bad" };
}

const CROWD_TONE = { low: "good", moderate: "warn", high: "bad" };

function useTick(ms) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function RightNow({ live, place }) {
  useTick(30_000);
  const w = live.weather;
  const today = w?.daily.find((d) => d.date === live.today) ?? w?.daily[0];
  const aqi = aqiInfo(live.airQuality?.usAqi);
  // GDACS "Green" events are informational; only Orange/Red count as active alerts.
  const alertCount =
    live.alerts.weather.filter((a) => a.date === live.today).length +
    live.alerts.quakes.length +
    live.alerts.disasters.filter((d) => d.alertLevel === "Orange" || d.alertLevel === "Red").length +
    live.alerts.nws.length;

  return (
    <Card strong className="relative overflow-hidden p-6 lg:col-span-7">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-sun/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Right now in</p>
          <h3 className="font-display text-3xl font-semibold text-white">{place.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
            <Clock aria-hidden className="size-3.5" /> {localTimeIn(live.place.timezone)} local · {live.place.timezone}
          </p>
        </div>
        {alertCount > 0 ? (
          <a href="#alerts" className="no-underline">
            <Badge tone="warn" icon={TriangleAlert}>
              {alertCount} active alert{alertCount > 1 ? "s" : ""}
            </Badge>
          </a>
        ) : (
          <Badge tone="good" icon={CheckCircle2}>
            No serious alerts
          </Badge>
        )}
      </div>

      {w ? (
        <div className="relative mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-center gap-4">
            <WeatherIcon code={w.current.code} isDay={w.current.isDay} className="size-16" />
            <div>
              <p className="font-display text-6xl leading-none font-semibold text-white">{Math.round(w.current.temp)}°</p>
              <p className="mt-1 text-sm text-white/70">
                {wmoLabel(w.current.code)} · feels {Math.round(w.current.feelsLike)}°
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Stat icon={Wind} label="Wind" value={`${Math.round(w.current.wind)} km/h`} />
            <Stat icon={Droplets} label="Humidity" value={`${Math.round(w.current.humidity)}%`} />
            <Stat icon={Activity} label="Air quality" value={aqi ? `${live.airQuality.usAqi} · ${aqi.label}` : "unavailable"} />
            <Stat icon={Sunrise} label="Sunrise" value={clock(today?.sunrise)} />
            <Stat icon={Sunset} label="Sunset" value={clock(today?.sunset)} />
            <Stat
              icon={Users}
              label="Crowds (est.)"
              value={live.crowd.now ? <Badge tone={CROWD_TONE[live.crowd.now.level]}>{live.crowd.now.level}</Badge> : "—"}
              title={live.crowd.now?.reasons.join(", ")}
            />
          </dl>
        </div>
      ) : (
        <div className="mt-6">
          <Unavailable>Current weather is unavailable from Open-Meteo right now.</Unavailable>
        </div>
      )}

      {w?.hourly?.length > 0 && (
        <div className="relative mt-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-white/55 uppercase">Next 24 hours · chance of rain</p>
          <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`Hourly rain chance: max ${Math.max(...w.hourly.map((h) => h.precipProb ?? 0))}% in the next 24 hours`}>
            {w.hourly.map((h, i) => (
              <motion.div
                key={h.time}
                title={`${clock(h.time)} · ${h.precipProb ?? 0}% · ${Math.round(h.temp)}°`}
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.015, duration: 0.4 }}
                style={{ height: `${Math.max(6, h.precipProb ?? 0)}%`, transformOrigin: "bottom" }}
                className="flex-1 rounded-t-[3px] bg-sky-400/70"
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/45">
            <span>{clock(w.hourly[0].time)}</span>
            <span>{clock(w.hourly[Math.floor(w.hourly.length / 2)].time)}</span>
            <span>{clock(w.hourly.at(-1).time)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, title }) {
  return (
    <div title={title}>
      <dt className="flex items-center gap-1 text-xs text-white/50">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-white/90">{value}</dd>
    </div>
  );
}

function CountryCard({ live, request }) {
  const c = live.country;
  return (
    <Card className="p-6 lg:col-span-5">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <Globe aria-hidden className="size-4 text-mint" /> Need-to-know
      </h3>
      {c ? (
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <Stat icon={Banknote} label="Currency" value={c.currencies.join(" / ") || "—"} />
          <Stat
            icon={Banknote}
            label="Exchange rate"
            value={live.fx ? `1 ${live.fx.from} = ${Number(live.fx.rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${live.fx.to}` : "unavailable"}
          />
          <Stat icon={Languages} label="Languages" value={c.languages.join(", ") || "—"} />
          <Stat icon={Info} label="Drives on the" value={c.drivingSide ?? "—"} />
          <Stat icon={Info} label="Calling code" value={c.callingCode ?? "—"} />
          <Stat icon={ShieldAlert} label="Emergency" value={c.emergency.length ? c.emergency.map((e) => e.number).join(" · ") : "not listed"} />
        </dl>
      ) : (
        <div className="mt-4">
          <Unavailable>Country facts are unavailable right now (Wikidata didn't respond).</Unavailable>
        </div>
      )}
      <p className="mt-4 text-xs text-white/45">
        Sources: Wikidata{live.fx ? `, ECB rates via Frankfurter (${live.fx.date})` : ""}. Budget shown in {request.currency}.
      </p>
    </Card>
  );
}

function ForecastStrip({ live, request }) {
  const w = live.weather;
  const tripSet = new Set(live.tripDates);
  const beyond = live.tripDates.filter((d) => !w?.daily.some((x) => x.date === d));
  return (
    <Card className="p-6 lg:col-span-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-white">16-day forecast</h3>
        <p className="text-xs text-white/50">
          Trip days are outlined · {live.forecastCoverage.covered}/{live.forecastCoverage.total} trip days covered
        </p>
      </div>
      {w ? (
        <ol className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2">
          {w.daily.map((d) => {
            const inTrip = tripSet.has(d.date);
            const dayNo = live.tripDates.indexOf(d.date) + 1;
            return (
              <li
                key={d.date}
                className={cx(
                  "min-w-[88px] snap-start rounded-xl border p-2.5 text-center",
                  inTrip ? "border-sun/60 bg-sun/[0.08]" : "border-white/8 bg-white/[0.02]",
                )}
                aria-label={`${fmtDate(d.date)}: ${wmoLabel(d.code)}, ${Math.round(d.tMin)} to ${Math.round(d.tMax)} degrees, ${d.precipProb ?? 0}% rain${inTrip ? `, trip day ${dayNo}` : ""}`}
              >
                <p className="text-[11px] font-semibold text-white/60">{inTrip ? `Day ${dayNo}` : fmtDate(d.date, { weekday: "short" })}</p>
                <p className="text-[11px] text-white/45">{fmtDate(d.date, { day: "numeric", month: "short" })}</p>
                <WeatherIcon code={d.code} className="mx-auto my-1.5 size-6" />
                <p className="text-sm font-semibold text-white">
                  {Math.round(d.tMax)}° <span className="font-normal text-white/50">{Math.round(d.tMin)}°</span>
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${d.precipProb ?? 0}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-white/50">{d.precipProb ?? 0}% rain</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-4">
          <Unavailable>The forecast is unavailable right now.</Unavailable>
        </div>
      )}
      {beyond.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-200/85">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {beyond.length === request.days ? "Your dates are" : `${beyond.length} of your days are`} beyond the 16-day forecast window, so they can't be
          weather-optimized yet. Come back closer to the date and re-plan.
        </p>
      )}
      {live.lastYear?.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 text-white/65 hover:text-white">
            <History aria-hidden className="size-4" /> Same dates last year (observed — context, not a forecast)
          </summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {live.lastYear.map((d) => (
              <li key={d.date} className="rounded-lg border border-white/8 px-2.5 py-1.5 text-xs text-white/70">
                {fmtDate(d.date, { day: "numeric", month: "short", year: "numeric" })}: {wmoLabel(d.code)}, {Math.round(d.tMin)}–{Math.round(d.tMax)}°C,{" "}
                {d.precip} mm
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function AlertsCard({ live }) {
  const a = live.alerts;
  const tripWeather = a.weather.filter((x) => x.scope === "trip");
  const none = !tripWeather.length && !a.quakes.length && !a.disasters.length && !a.nws.length;
  return (
    <Card className="p-6 lg:col-span-5" id="alerts">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <ShieldAlert aria-hidden className="size-4 text-coral" /> Safety & disruption alerts
      </h3>
      {none ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-emerald-200/90">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          No forecast warnings for your dates, no M4+ earthquakes within 300 km this week, and no GDACS disaster events nearby.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5 text-sm">
          {a.nws.map((n, i) => (
            <AlertRow key={`nws${i}`} tone="bad" title={n.event} detail={n.headline} source="US National Weather Service" />
          ))}
          {a.disasters.map((d, i) => (
            <AlertRow
              key={`gd${i}`}
              tone={d.alertLevel === "Red" ? "bad" : d.alertLevel === "Orange" ? "warn" : "info"}
              title={d.name}
              detail={`${d.alertLevel === "Green" ? "Green (low impact)" : d.alertLevel} alert${d.distanceKm != null ? ` · ${d.distanceKm} km away` : ""}`}
              source="GDACS"
              href={safeUrl(d.url)}
            />
          ))}
          {a.quakes.map((q, i) => (
            <AlertRow key={`q${i}`} tone="warn" title={q.title} detail={`${q.distanceKm} km away · ${new Date(q.time).toLocaleString()}`} source="USGS" href={safeUrl(q.url)} />
          ))}
          {tripWeather.map((w, i) => (
            <AlertRow key={`w${i}`} tone={w.severity === "high" ? "bad" : "warn"} title={`${fmtDate(w.date)} · ${w.title}`} detail={w.detail} source={w.source} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-white/45">
        Closures and strikes have no open live feed — check official sites for must-see places. Your government's travel advisory is the authority on
        safety.
      </p>
    </Card>
  );
}

function AlertRow({ tone, title, detail, source, href }) {
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-white">{title}</p>
        <Badge tone={tone}>{source}</Badge>
      </div>
      {detail && <p className="mt-1 text-white/65">{detail}</p>}
      {href && (
        <a href={href} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs text-sky-300 underline-offset-2 hover:underline">
          Details
        </a>
      )}
    </li>
  );
}

function HappeningCard({ live, health }) {
  return (
    <Card className="p-6 lg:col-span-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <CalendarHeart aria-hidden className="size-4 text-iris" /> Holidays & events
      </h3>
      <div className="mt-4 space-y-3 text-sm">
        {live.holidays.inTrip.length ? (
          live.holidays.inTrip.map((h) => (
            <p key={h.date} className="rounded-xl border border-iris/25 bg-iris/10 p-3">
              <span className="font-medium text-white">{h.name}</span>
              <span className="block text-white/60">{fmtDate(h.date)} · public holiday — expect crowds and possible closures</span>
            </p>
          ))
        ) : (
          <p className="text-white/65">No public holidays during your dates (Nager.Date).</p>
        )}
        {live.events?.length ? (
          <ul className="space-y-1.5">
            {live.events.slice(0, 6).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <Ticket aria-hidden className="mt-0.5 size-3.5 shrink-0 text-sun" />
                <span>
                  {safeUrl(e.url) ? (
                    <a href={safeUrl(e.url)} target="_blank" rel="noreferrer noopener" className="text-white hover:underline">
                      {e.name}
                    </a>
                  ) : (
                    <span className="text-white">{e.name}</span>
                  )}
                  <span className="block text-xs text-white/50">
                    {fmtDate(e.date)}
                    {e.venue ? ` · ${e.venue}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Unavailable>
            {live.events
              ? "No ticketed events found for your dates."
              : health?.events === false
                ? "Live events aren't connected (add a TICKETMASTER_API_KEY on the server). We won't guess at events."
                : "Live events are unavailable right now."}
          </Unavailable>
        )}
      </div>
    </Card>
  );
}

function CrowdCard({ live }) {
  return (
    <Card className="p-6 lg:col-span-3">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <Users aria-hidden className="size-4 text-sky" /> Crowd outlook
      </h3>
      <ul className="mt-4 space-y-2 text-sm">
        {live.crowd.days.map((d, i) => (
          <li key={d.date} className="flex items-center justify-between gap-2" title={d.reasons.join(", ")}>
            <span className="text-white/70">
              Day {i + 1} · {fmtDate(d.date, { weekday: "short" })}
            </span>
            <Badge tone={CROWD_TONE[d.level]}>{d.level}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-white/45">Estimate from weekdays and holidays — there's no free live crowd feed.</p>
    </Card>
  );
}

function Sources({ live }) {
  const tone = { ok: "good", unavailable: "bad", "not-configured": "neutral", "n/a": "neutral", estimate: "warn" };
  return (
    <div className="lg:col-span-12">
      <p className="mb-2 text-xs font-semibold tracking-wide text-white/50 uppercase">Data sources</p>
      <ul className="flex flex-wrap gap-2">
        {live.sources.map((s) => (
          <li key={s.id}>
            <Badge tone={tone[s.status] ?? "neutral"} title={s.detail ?? undefined}>
              {s.name}: {s.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LiveDashboard() {
  const request = useTrip((s) => s.request);
  const live = useTrip((s) => s.live);
  const status = useTrip((s) => s.liveStatus);
  const error = useTrip((s) => s.liveError);
  const health = useTrip((s) => s.health);
  if (!request) return null;
  const place = request.destination;

  return (
    <section id="live" aria-labelledby="live-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeader id="live-title" eyebrow="Step 2 · Live conditions" title={`What's happening in ${place.name}`}>
        Pulled moments ago from open data sources. Anything we couldn't confirm is labelled — never guessed.
      </SectionHeader>
      {status === "loading" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-busy="true" aria-label="Loading live conditions">
          <Skeleton className="h-72 lg:col-span-7" />
          <Skeleton className="h-72 lg:col-span-5" />
          <Skeleton className="h-44 lg:col-span-12" />
        </div>
      )}
      {status === "error" && <Unavailable>Live conditions couldn't be loaded: {error}</Unavailable>}
      {status === "ready" && live && (
        <Reveal className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <RightNow live={live} place={place} />
          <CountryCard live={live} request={request} />
          <ForecastStrip live={live} request={request} />
          <AlertsCard live={live} />
          <HappeningCard live={live} health={health} />
          <CrowdCard live={live} />
          <Sources live={live} />
        </Reveal>
      )}
    </section>
  );
}
