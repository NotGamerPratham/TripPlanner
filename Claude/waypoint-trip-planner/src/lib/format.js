const moneyFormatters = new Map();

export function money(value, currency = "USD", { compact = false, exact = false } = {}) {
  if (value == null || Number.isNaN(value)) return "—";
  const digits = exact || Math.abs(value) < 20 ? 2 : 0;
  const key = `${currency}:${compact}:${digits}`;
  if (!moneyFormatters.has(key)) {
    try {
      moneyFormatters.set(
        key,
        new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          notation: compact ? "compact" : "standard",
          maximumFractionDigits: digits,
          minimumFractionDigits: 0,
        }),
      );
    } catch {
      moneyFormatters.set(key, { format: (v) => `${currency} ${Math.round(v).toLocaleString()}` });
    }
  }
  return moneyFormatters.get(key).format(value);
}

/** Dates are local calendar dates at the destination (YYYY-MM-DD). */
export const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", ...opts }) : "";

export const weekday = (iso) => fmtDate(iso, { weekday: "short" });

export function duration(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** "2026-10-12T06:03" → "06:03" */
export const clock = (isoDateTime) => (isoDateTime ? isoDateTime.slice(11, 16) : "—");

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 55, h * 60 + m + min));
  const rounded = Math.round(total / 5) * 5;
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

export const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function localTimeIn(timeZone, date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Only let http(s) links from upstream data reach an href. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
