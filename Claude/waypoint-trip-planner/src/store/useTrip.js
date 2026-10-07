import { useMemo } from "react";
import { create } from "zustand";
import { getJSON, streamNDJSON } from "../lib/api.js";
import { addDaysISO, addMinutes, minutesOf, todayISO, uid } from "../lib/format.js";
import { computeBudget } from "../lib/budget.js";
import { estimateTravel, hasCoords, routeProfile } from "../lib/geo.js";
import { optimizeForWeather } from "../lib/optimize.js";
import * as storage from "../lib/storage.js";

const emptyPlan = () => ({ overview: null, days: [], stays: null, food: null, transport: null, extras: null });

export const EXAMPLES = [
  {
    label: "Kyoto · 4 days",
    query: "Kyoto",
    destination: { name: "Kyoto", admin1: "Kyoto", country: "Japan", countryCode: "JP", lat: 35.02107, lon: 135.75385, timezone: "Asia/Tokyo" },
    origin: "Tokyo",
    days: 4,
    travelers: 2,
    budget: 1800,
    currency: "USD",
    style: "mid",
    interests: ["Culture & history", "Food & markets", "Nature & hikes"],
    food: ["No restrictions"],
    transport: ["Public transit", "Walking"],
  },
  {
    label: "Lisbon · 3 days",
    query: "Lisbon",
    destination: { name: "Lisbon", admin1: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.71667, lon: -9.13333, timezone: "Europe/Lisbon" },
    origin: "London",
    days: 3,
    travelers: 1,
    budget: 700,
    currency: "EUR",
    style: "backpacker",
    interests: ["Architecture", "Food & markets", "Photography"],
    food: ["Vegetarian"],
    transport: ["Walking", "Public transit"],
  },
  {
    label: "Jaipur · 3 days",
    query: "Jaipur",
    destination: { name: "Jaipur", admin1: "Rajasthan", country: "India", countryCode: "IN", lat: 26.91962, lon: 75.78781, timezone: "Asia/Kolkata" },
    origin: "Delhi",
    days: 3,
    travelers: 2,
    budget: 30000,
    currency: "INR",
    style: "mid",
    interests: ["Culture & history", "Shopping", "Architecture"],
    food: ["Vegetarian", "Street food lover"],
    transport: ["Taxi / rideshare", "Walking"],
  },
];

const defaultForm = () => ({
  query: "",
  destination: null,
  origin: "",
  startDate: addDaysISO(todayISO(), 5),
  days: 4,
  travelers: 2,
  budget: 1500,
  currency: "USD",
  style: "mid",
  interests: ["Culture & history", "Food & markets"],
  food: ["No restrictions"],
  transport: ["Public transit", "Walking"],
  notes: "",
});

let planController = null;
let chatController = null;
const routeTimers = new Map();
let routeQueue = Promise.resolve();

/** Recompute start times sequentially after a reorder. */
function retime(activities, startTime, legs) {
  let clockMin = minutesOf(startTime);
  let prev = null;
  let legIdx = 0;
  return activities.map((a, i) => {
    let travel = 0;
    if (i > 0) {
      const routed = prev && hasCoords(prev) && hasCoords(a) && legs ? legs[legIdx++] : null;
      const est = estimateTravel(prev, a);
      travel = routed?.durationMin ?? est?.minutes ?? a.travelMinFromPrev;
    }
    if (!a.skipped) {
      clockMin += travel;
    }
    const time = addMinutes("00:00", clockMin);
    const next = { ...a, time, travelMinFromPrev: i === 0 ? 0 : travel };
    if (!a.skipped) {
      clockMin += a.durationMin;
      prev = a;
    }
    return next;
  });
}

export const useTrip = create((set, get) => ({
  form: defaultForm(),
  setForm: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
  applyExample: (ex) =>
    set((s) => ({
      form: {
        ...s.form,
        query: [ex.destination.name, ex.destination.admin1 !== ex.destination.name ? ex.destination.admin1 : null, ex.destination.country].filter(Boolean).join(", "),
        destination: ex.destination,
        origin: ex.origin,
        days: ex.days,
        travelers: ex.travelers,
        budget: ex.budget,
        currency: ex.currency,
        style: ex.style,
        interests: ex.interests,
        food: ex.food,
        transport: ex.transport,
      },
    })),

  health: null,
  loadHealth: async () => {
    // The API may still be booting when the page first loads in dev.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        set({ health: await getJSON("/api/health") });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    set({ health: { ok: false, ai: false } });
  },

  /* ----------------------------- trip & live ----------------------------- */
  request: null,
  tripId: null,
  live: null,
  liveStatus: "idle",
  liveError: null,
  places: null,
  placesStatus: "idle",
  placesError: null,

  plan: emptyPlan(),
  planStatus: "idle", // idle | streaming | done | error
  planMode: "plan",
  planError: null,
  pendingSection: null,
  statusMessage: "",
  thinking: "",
  choices: { stayTier: "mid", stayIndex: 0, travelIndex: 0 },
  savings: null,
  routes: {},
  activeDayKey: null,
  mapFocus: null,

  startTrip: async (request) => {
    planController?.abort();
    set({
      request,
      tripId: uid(),
      live: null,
      liveStatus: "loading",
      liveError: null,
      places: null,
      placesStatus: "loading",
      placesError: null,
      plan: emptyPlan(),
      planStatus: "idle",
      planError: null,
      savings: null,
      routes: {},
      activeDayKey: null,
      choices: { stayTier: request.style, stayIndex: 0, travelIndex: 0 },
    });
    const d = request.destination;
    const liveParams = {
      lat: d.lat,
      lon: d.lon,
      start: request.startDate,
      days: request.days,
      currency: request.currency,
      ...(d.countryCode ? { cc: d.countryCode } : {}),
      ...(d.country ? { country: d.country } : {}),
      ...(d.timezone ? { tz: d.timezone } : {}),
    };
    getJSON("/api/live", liveParams)
      .then((live) => get().request === request && set({ live, liveStatus: "ready" }))
      .catch((err) => get().request === request && set({ liveStatus: "error", liveError: err.message }));
    getJSON("/api/places", { lat: d.lat, lon: d.lon })
      .then((places) => get().request === request && set({ places, placesStatus: "ready" }))
      .catch((err) => get().request === request && set({ placesStatus: "error", placesError: err.message }));
    get().runPlan("plan");
  },

  runPlan: async (mode = "plan") => {
    const { request, plan, choices } = get();
    if (!request) return;
    planController?.abort();
    const controller = new AbortController();
    planController = controller;
    const before = mode === "cheaper" ? computeBudget(plan, request, choices) : null;
    set({
      planStatus: "streaming",
      planMode: mode,
      planError: null,
      pendingSection: null,
      thinking: "",
      statusMessage: mode === "cheaper" ? "Hunting for savings…" : "Starting…",
      savings: null,
      ...(mode === "plan" ? { plan: emptyPlan(), routes: {} } : {}),
    });

    const onEvent = (ev) => {
      if (controller.signal.aborted) return;
      switch (ev.type) {
        case "status":
          set({ statusMessage: ev.message });
          break;
        case "thinking":
          set({ thinking: ev.text });
          break;
        case "section_start":
          set({ pendingSection: ev.section });
          break;
        case "section_retry":
          set({ statusMessage: `Claude is correcting the ${ev.section} section…` });
          break;
        case "section":
          get().receiveSection(ev.section, ev.data, mode);
          break;
        case "error":
          set({ planStatus: "error", planError: ev.message, pendingSection: null });
          break;
        case "done": {
          const after = computeBudget(get().plan, request, get().choices);
          set({
            planStatus: "done",
            pendingSection: null,
            statusMessage: "",
            thinking: "",
            savings: before && after ? { before: before.total, after: after.total } : null,
          });
          get().refreshAllRoutes();
          break;
        }
      }
    };

    try {
      const body =
        mode === "cheaper"
          ? { request, plan: get().plan, total: before?.total ?? 0 }
          : { request };
      await streamNDJSON(mode === "cheaper" ? "/api/ai/cheaper" : "/api/ai/plan", body, onEvent, { signal: controller.signal });
      if (get().planStatus === "streaming" && !controller.signal.aborted) {
        set({ planStatus: "error", planError: "The connection closed before the plan finished. Please try again." });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      set({ planStatus: "error", planError: err.message, pendingSection: null });
    }
  },

  cancelPlan: () => {
    planController?.abort();
    set((s) => ({ planStatus: s.plan.days.length ? "done" : "idle", pendingSection: null, statusMessage: "" }));
  },

  receiveSection: (section, data, mode) =>
    set((s) => {
      const plan = { ...s.plan };
      const patch = {};
      if (section === "day") {
        const day = { ...data, startTime: data.activities[0]?.time ?? "09:00", retimed: false };
        const days = plan.days.filter((d) => d.day !== day.day);
        days.push(day);
        days.sort((a, b) => a.day - b.day);
        plan.days = days;
        if (!s.activeDayKey || !s.plan.days.some((d) => d.key === s.activeDayKey)) patch.activeDayKey = day.key;
      } else {
        plan[section] = data;
        // A fresh plan adopts Claude's recommendations; "make it cheaper" keeps the
        // traveler's own picks (clamped) so the before/after comparison is fair.
        if (section === "stays") {
          const tierLen = data.tiers[s.choices.stayTier]?.length ?? 1;
          patch.choices =
            mode === "plan"
              ? { ...s.choices, stayTier: data.recommendedTier, stayIndex: 0 }
              : { ...s.choices, stayIndex: Math.min(s.choices.stayIndex, tierLen - 1) };
        }
        if (section === "transport") {
          const base = patch.choices ?? s.choices;
          patch.choices =
            mode === "plan"
              ? { ...base, travelIndex: Math.min(data.recommended ?? 0, data.gettingThere.length - 1) }
              : { ...base, travelIndex: Math.min(base.travelIndex, data.gettingThere.length - 1) };
        }
      }
      return { plan, pendingSection: null, ...patch };
    }),

  /* ------------------------------ editing ------------------------------- */
  setChoices: (patch) => set((s) => ({ choices: { ...s.choices, ...patch } })),
  setActiveDay: (key) => set({ activeDayKey: key }),
  focusPlace: (place) => set({ mapFocus: place ? { ...place, at: Date.now() } : null }),

  updateDay: (key, updater, { retimeDay = false } = {}) => {
    set((s) => ({
      plan: {
        ...s.plan,
        days: s.plan.days.map((d) => {
          if (d.key !== key) return d;
          const next = updater(d);
          if (!retimeDay) return next;
          return { ...next, retimed: true, activities: retime(next.activities, next.startTime ?? "09:00", null) };
        }),
      },
    }));
    if (retimeDay) get().scheduleRoute(key);
  },

  /** Drag-and-drop: move an activity within or across days. */
  moveActivity: (activeId, toKey, toIndex) => {
    const { plan } = get();
    const from = plan.days.find((d) => d.activities.some((a) => a.id === activeId));
    const to = plan.days.find((d) => d.key === toKey);
    if (!from || !to) return;
    const item = from.activities.find((a) => a.id === activeId);
    const days = plan.days.map((d) => {
      if (d.key === from.key && d.key === to.key) {
        const rest = d.activities.filter((a) => a.id !== activeId);
        rest.splice(Math.min(toIndex, rest.length), 0, item);
        return { ...d, activities: rest };
      }
      if (d.key === from.key) return { ...d, activities: d.activities.filter((a) => a.id !== activeId) };
      if (d.key === to.key) {
        const acts = [...d.activities];
        acts.splice(Math.min(toIndex, acts.length), 0, item);
        return { ...d, activities: acts };
      }
      return d;
    });
    set({ plan: { ...plan, days } });
  },

  /** Called once a drag ends — re-time touched days and refresh their routes. */
  commitMove: (keys) => {
    set((s) => ({
      plan: {
        ...s.plan,
        days: s.plan.days.map((d) =>
          keys.includes(d.key) ? { ...d, retimed: true, activities: retime(d.activities, d.startTime ?? "09:00", null) } : d,
        ),
      },
    }));
    keys.forEach((k) => get().scheduleRoute(k));
  },

  toggleSkip: (dayKey, id) =>
    get().updateDay(dayKey, (d) => ({ ...d, activities: d.activities.map((a) => (a.id === id ? { ...a, skipped: !a.skipped } : a)) }), {
      retimeDay: true,
    }),

  toggleAlternative: (dayKey, id) =>
    get().updateDay(dayKey, (d) => ({
      ...d,
      activities: d.activities.map((a) => {
        if (a.id !== id) return a;
        if (a.swapped && a.original) return { ...a.original, id: a.id };
        if (!a.budgetAlternative) return a;
        return {
          ...a,
          original: { ...a, original: undefined },
          swapped: true,
          title: a.budgetAlternative.title,
          costPerPerson: a.budgetAlternative.costPerPerson,
          costNote: a.budgetAlternative.note,
          description: `Budget swap for “${a.title}”. ${a.budgetAlternative.note}`,
          placeId: null,
          lat: null,
          lon: null,
          verified: false,
          budgetAlternative: null,
        };
      }),
    })),

  optimizeWeather: () => {
    const { plan, live } = get();
    if (!live?.weather) return { ok: false, message: "No forecast available to optimise against." };
    const byDate = Object.fromEntries(live.weather.daily.map((d) => [d.date, d]));
    const result = optimizeForWeather(plan.days, plan.food, byDate);
    if (!result) return { ok: false, message: "Your days already match the forecast (or dates are beyond it)." };
    set({ plan: { ...plan, days: result.days, food: result.food } });
    return { ok: true, changes: result.changes };
  },

  /* ------------------------------- routing ------------------------------- */
  scheduleRoute: (key) => {
    clearTimeout(routeTimers.get(key));
    routeTimers.set(
      key,
      setTimeout(() => {
        routeQueue = routeQueue.then(() => get().fetchRoute(key)).catch(() => {});
      }, 450),
    );
  },

  refreshAllRoutes: () => get().plan.days.forEach((d) => get().scheduleRoute(d.key)),

  fetchRoute: async (key) => {
    const day = get().plan.days.find((d) => d.key === key);
    if (!day) return;
    const points = day.activities.filter((a) => !a.skipped && hasCoords(a));
    if (points.length < 2) {
      set((s) => ({ routes: { ...s.routes, [key]: { status: "none", sig: "" } } }));
      return;
    }
    const sig = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";");
    if (get().routes[key]?.sig === sig && get().routes[key]?.status !== "error") return;
    const profile = routeProfile(points);
    set((s) => ({ routes: { ...s.routes, [key]: { ...s.routes[key], status: "loading", sig } } }));
    try {
      const data = await getJSON("/api/route", { profile, coords: sig });
      set((s) => ({ routes: { ...s.routes, [key]: { status: "ok", sig, data } } }));
      // After a manual reorder, re-time the day with real routed legs.
      const current = get().plan.days.find((d) => d.key === key);
      if (current?.retimed) {
        set((s) => ({
          plan: {
            ...s.plan,
            days: s.plan.days.map((d) => (d.key === key ? { ...d, activities: retime(d.activities, d.startTime ?? "09:00", data.legs) } : d)),
          },
        }));
      }
    } catch (err) {
      set((s) => ({ routes: { ...s.routes, [key]: { status: "error", sig, error: err.message } } }));
    }
  },

  /* --------------------------- save / load ------------------------------- */
  snapshot: () => {
    const { tripId, request, plan, choices } = get();
    return { v: 1, id: tripId ?? uid(), savedAt: new Date().toISOString(), request, plan, choices };
  },

  saveCurrent: () => {
    const snap = get().snapshot();
    return storage.saveTrip(snap);
  },

  loadTrip: (trip) => {
    planController?.abort();
    const request = trip.request;
    set({
      tripId: trip.id,
      request,
      plan: {
        ...emptyPlan(),
        ...trip.plan,
        days: trip.plan.days.map((d) => ({ ...d, startTime: d.startTime ?? d.activities[0]?.time ?? "09:00" })),
      },
      choices: { stayTier: request.style, stayIndex: 0, travelIndex: 0, ...(trip.choices ?? {}) },
      planStatus: "done",
      planError: null,
      savings: null,
      routes: {},
      activeDayKey: trip.plan.days[0]?.key ?? null,
      form: { ...get().form, ...request, query: request.destination.name, destination: request.destination },
      live: null,
      liveStatus: "loading",
      places: null,
      placesStatus: "loading",
    });
    const d = request.destination;
    getJSON("/api/live", {
      lat: d.lat,
      lon: d.lon,
      start: request.startDate,
      days: request.days,
      currency: request.currency,
      ...(d.countryCode ? { cc: d.countryCode } : {}),
      ...(d.country ? { country: d.country } : {}),
      ...(d.timezone ? { tz: d.timezone } : {}),
    })
      .then((live) => set({ live, liveStatus: "ready" }))
      .catch((err) => set({ liveStatus: "error", liveError: err.message }));
    getJSON("/api/places", { lat: d.lat, lon: d.lon })
      .then((places) => set({ places, placesStatus: "ready" }))
      .catch((err) => set({ placesStatus: "error", placesError: err.message }));
    get().refreshAllRoutes();
  },

  /* -------------------------------- chat --------------------------------- */
  chat: [],
  chatStatus: "idle",
  sendChat: async (text) => {
    const { request, plan, choices, chat } = get();
    chatController?.abort();
    const controller = new AbortController();
    chatController = controller;
    const userMsg = { id: uid(), role: "user", content: text };
    const botMsg = { id: uid(), role: "assistant", content: "" };
    set({ chat: [...chat, userMsg, botMsg], chatStatus: "streaming" });
    const history = [...chat, userMsg].filter((m) => m.content && !m.error).slice(-16).map(({ role, content }) => ({ role, content }));
    const budget = computeBudget(plan, request, choices);
    const patchBot = (fn) => set((s) => ({ chat: s.chat.map((m) => (m.id === botMsg.id ? fn(m) : m)) }));
    try {
      await streamNDJSON(
        "/api/ai/chat",
        {
          messages: history,
          ...(request ? { request } : {}),
          ...(plan.days.length ? { plan } : {}),
          ...(budget ? { total: budget.total } : {}),
        },
        (ev) => {
          if (ev.type === "text") patchBot((m) => ({ ...m, content: m.content + ev.delta }));
          if (ev.type === "error") patchBot((m) => ({ ...m, error: true, content: m.content || ev.message }));
        },
        { signal: controller.signal },
      );
      set({ chatStatus: "idle" });
    } catch (err) {
      if (err.name === "AbortError") return;
      patchBot((m) => ({ ...m, error: true, content: err.message }));
      set({ chatStatus: "idle" });
    }
  },
  clearChat: () => {
    chatController?.abort();
    set({ chat: [], chatStatus: "idle" });
  },

  /* ------------------------------- toasts -------------------------------- */
  toasts: [],
  toast: (text, tone = "info") => {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
}));

export const useBudget = () => {
  const plan = useTrip((s) => s.plan);
  const request = useTrip((s) => s.request);
  const choices = useTrip((s) => s.choices);
  return useMemo(() => computeBudget(plan, request, choices), [plan, request, choices]);
};
