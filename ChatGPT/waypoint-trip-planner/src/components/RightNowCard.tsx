import type { LiveContext } from '../types';

export default function RightNowCard({ context }: { context: LiveContext }) {
  const w = context.weather;
  return (
    <section className="glass-panel overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4"><p className="eyebrow">Right now</p><h2 className="mt-1 text-xl font-semibold">At {context.destination.name}</h2></div>
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <div><div className="metric">{w ? `${Math.round(w.current.temperature)}°` : 'Unavailable'}</div><div className="metric-label">temperature</div></div>
        <div><div className="metric">{w ? w.current.weatherLabel : 'Unavailable'}</div><div className="metric-label">conditions</div></div>
        <div><div className="metric">{w ? `${Math.round(w.current.windSpeed)} km/h` : 'Unavailable'}</div><div className="metric-label">wind</div></div>
        <div><div className="metric">{context.crowd.data?.level ?? 'Unavailable'}</div><div className="metric-label">crowd signal</div></div>
      </div>
      <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-3">
        <Signal label="Events" status={context.events.status} message={context.events.status === 'available' ? `${context.events.data?.length ?? 0} loaded` : 'Source not configured'} />
        <Signal label="Closures" status={context.closures.status} message={context.closures.status === 'available' ? `${context.closures.data?.length ?? 0} loaded` : 'Source not configured'} />
        <Signal label="Safety" status={context.safety.status} message={context.safety.status === 'available' ? `${context.safety.data?.length ?? 0} alerts` : 'Source not configured'} />
      </div>
    </section>
  );
}

function Signal({ label, status, message }: { label: string; status: string; message: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between text-sm font-medium"><span>{label}</span><span className={status === 'available' ? 'status-ok' : 'status-muted'}>{status}</span></div><p className="mt-2 text-sm text-white/60">{message}</p></div>;
}
