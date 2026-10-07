// The budget is always *derived* from the plan — never stored — so drag-and-
// drop, skips, swaps and "make it cheaper" update every total instantly.

export const BUFFER_RATE = 0.1;

export const CATEGORY_META = {
  stay: { label: "Stay", color: "var(--color-viz-1)" },
  travel: { label: "Getting there", color: "var(--color-viz-2)" },
  activities: { label: "Activities & entry", color: "var(--color-viz-3)" },
  food: { label: "Food & drink", color: "var(--color-viz-4)" },
  local: { label: "Local transport", color: "var(--color-viz-5)" },
  misc: { label: "Extras & misc", color: "var(--color-viz-6)" },
  buffer: { label: "10% buffer", color: "var(--color-viz-buffer)" },
};

const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);

export const activityCost = (a) => (a.skipped ? 0 : a.costPerPerson);

export function mealsForDay(food, dayNumber) {
  const m = food?.daily?.find((x) => x.day === dayNumber);
  return m ? m.breakfast.costPerPerson + m.lunch.costPerPerson + m.dinner.costPerPerson : null;
}

export function selectedStay(plan, choices) {
  const tier = plan?.stays?.tiers?.[choices?.stayTier ?? "mid"];
  return tier?.[choices?.stayIndex ?? 0] ?? tier?.[0] ?? null;
}

export function selectedTravel(plan, choices) {
  const list = plan?.transport?.gettingThere;
  return list?.[choices?.travelIndex ?? 0] ?? list?.[0] ?? null;
}

export function computeBudget(plan, request, choices) {
  if (!plan || !request) return null;
  const T = request.travelers;
  const nDays = request.days;
  const nights = Math.max(1, nDays - 1);

  const stayOpt = selectedStay(plan, choices);
  const travelOpt = selectedTravel(plan, choices);

  const perDay = plan.days.map((d) => {
    const activities = sum(d.activities.map(activityCost)) * T;
    const local = (d.localTransportPerPerson ?? 0) * T;
    const meals = mealsForDay(plan.food, d.day);
    const food = meals == null ? 0 : meals * T;
    return { key: d.key, day: d.day, activities, local, food, total: activities + local + food };
  });

  const values = {
    stay: stayOpt ? stayOpt.pricePerNight * nights : 0,
    travel: travelOpt ? travelOpt.costPerPersonRoundTrip * T : 0,
    activities: sum(perDay.map((d) => d.activities)),
    food: plan.food ? sum(perDay.map((d) => d.food)) + plan.food.snacksPerPersonPerDay * nDays * T : 0,
    local: sum(perDay.map((d) => d.local)),
    misc: plan.extras ? plan.extras.miscPerPersonPerDay * nDays * T : 0,
  };
  const subtotal = sum(Object.values(values));
  const buffer = subtotal * BUFFER_RATE;
  const total = subtotal + buffer;

  const notes = {
    stay: stayOpt ? `${nights} night${nights > 1 ? "s" : ""} · ${stayOpt.name}` : "waiting for stays",
    travel: travelOpt ? `${travelOpt.mode} round trip × ${T}` : "waiting for transport",
    activities: `${plan.days.reduce((n, d) => n + d.activities.filter((a) => !a.skipped).length, 0)} stops × ${T}`,
    food: plan.food ? `3 meals + snacks × ${nDays} days × ${T}` : "waiting for food guide",
    local: `${nDays} days of local transport × ${T}`,
    misc: plan.extras ? `SIM, tips, small extras × ${nDays} days` : "waiting for extras",
    buffer: "for the unexpected",
  };

  const categories = [...Object.entries(values), ["buffer", buffer]].map(([id, value]) => ({
    id,
    value,
    note: notes[id],
    ...CATEGORY_META[id],
  }));

  return {
    categories,
    subtotal,
    buffer,
    total,
    budget: request.budget,
    remaining: request.budget - total,
    pctUsed: request.budget ? total / request.budget : 0,
    perPerson: total / T,
    perDay,
    nights,
    complete: Boolean(plan.stays && plan.food && plan.transport && plan.extras && plan.days.length === nDays),
  };
}
