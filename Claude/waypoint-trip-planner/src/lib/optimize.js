// Deterministic "re-optimize for weather": keep arrival/departure days in
// place, then give the most outdoor-heavy days the driest forecast dates.
import { wetness } from "../../shared/weather.js";

export function outdoorShare(day) {
  const active = day.activities.filter((a) => !a.skipped && a.kind !== "transit" && a.kind !== "rest");
  const total = active.reduce((n, a) => n + a.durationMin, 0) || 1;
  return active.filter((a) => !a.indoor).reduce((n, a) => n + a.durationMin, 0) / total;
}

/**
 * @returns {{ days, food, changes: Array<{title, from, to}> } | null} null when
 *   the forecast can't improve anything.
 */
export function optimizeForWeather(days, food, forecastByDate) {
  if (days.length < 2) return null;
  const fixedEnds = days.length >= 4;
  const movable = days.filter((_, i) => !fixedEnds || (i !== 0 && i !== days.length - 1));
  const dates = movable.map((d) => d.date);
  if (!dates.every((date) => forecastByDate[date])) return null; // only optimise with real forecasts

  const byOutdoor = [...movable].sort((a, b) => outdoorShare(b) - outdoorShare(a));
  const byDryness = [...dates].sort((a, b) => wetness(forecastByDate[a]) - wetness(forecastByDate[b]));
  const assignment = new Map(byOutdoor.map((d, i) => [d.key, byDryness[i]]));

  const changes = [];
  const dayNumberOf = (date) => days.findIndex((d) => d.date === date) + 1;
  const moved = days.map((d) => {
    const newDate = assignment.get(d.key);
    if (!newDate || newDate === d.date) return d;
    changes.push({ title: d.title, from: d.date, to: newDate });
    return { ...d, date: newDate, day: dayNumberOf(newDate), retimed: d.retimed };
  });
  if (!changes.length) return null;

  // Meal plans follow the day they were written for.
  const remap = new Map(days.map((d) => [d.day, moved.find((m) => m.key === d.key).day]));
  const newFood = food
    ? { ...food, daily: food.daily.map((m) => ({ ...m, day: remap.get(m.day) ?? m.day })).sort((a, b) => a.day - b.day) }
    : food;

  return { days: [...moved].sort((a, b) => a.date.localeCompare(b.date)), food: newFood, changes };
}
