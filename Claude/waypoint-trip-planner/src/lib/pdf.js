// Vector PDF export (lazy-loaded). jsPDF's built-in fonts cover Latin-1 only,
// so text is normalised; use Print for scripts like Japanese or Devanagari.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { wmoLabel } from "../../shared/weather.js";
import { selectedStay, selectedTravel } from "./budget.js";

const clean = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[→]/g, "->")
    .replace(/°/g, " deg")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const INK = [11, 16, 32];
const SUN = [245, 181, 68];

export async function exportPdf({ request, plan, choices, live, budget }) {
  const cur = request.currency;
  const m = (v) => `${cur} ${Math.round(v).toLocaleString("en-US")}`;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const X = 40;
  let y = 0;

  const ensure = (space) => {
    if (y + space > H - 50) {
      doc.addPage();
      y = 50;
    }
  };
  const heading = (text) => {
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(clean(text), X, y);
    y += 8;
    doc.setDrawColor(...SUN);
    doc.setLineWidth(1.5);
    doc.line(X, y, X + 36, y);
    y += 16;
  };
  const para = (text, { size = 10, color = [60, 64, 80], gap = 8 } = {}) => {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(text), W - X * 2);
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, X, y);
      y += size + 3;
    }
    y += gap;
  };
  const table = (opts) => {
    autoTable(doc, {
      startY: y,
      margin: { left: X, right: X },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 4, textColor: [40, 44, 60], lineColor: [225, 228, 236] },
      headStyles: { fillColor: [27, 35, 56], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [245, 246, 250], textColor: [11, 16, 32], fontStyle: "bold" },
      ...opts,
      head: opts.head?.map((r) => r.map(clean)),
      body: opts.body.map((r) => r.map(clean)),
      foot: opts.foot?.map((r) => r.map(clean)),
    });
    y = doc.lastAutoTable.finalY + 18;
  };

  /* Cover band */
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 118, "F");
  doc.setTextColor(...SUN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("WAYPOINT  ·  TRIP PLAN", X, 34);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  const title = doc.splitTextToSize(clean(plan.overview?.title ?? `${request.destination.name} trip`), W - X * 2);
  doc.text(title.slice(0, 2), X, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 204, 220);
  const end = plan.days.at(-1)?.date ?? request.startDate;
  doc.text(
    clean(`${request.destination.name}${request.destination.country ? `, ${request.destination.country}` : ""}  ·  ${request.startDate} to ${end}  ·  ${request.travelers} traveler(s)  ·  ${request.style}`),
    X,
    100,
  );
  y = 148;

  if (plan.overview) {
    para(plan.overview.tagline, { size: 12, color: [11, 16, 32], gap: 4 });
    para(plan.overview.summary);
    para(`Weather strategy: ${plan.overview.weatherStrategy}`);
    para(`Budget verdict: ${plan.overview.budgetVerdict}`);
    if (plan.overview.dataGaps?.length) para(`Verify before you go: ${plan.overview.dataGaps.join(" | ")}`, { color: [150, 90, 0] });
  }

  if (budget) {
    heading("Budget");
    table({
      head: [["Category", "Amount", "Details"]],
      body: budget.categories.map((c) => [c.label, m(c.value), c.note]),
      foot: [["Total (incl. 10% buffer)", m(budget.total), `Budget ${m(budget.budget)} - ${budget.remaining >= 0 ? `${m(budget.remaining)} to spare` : `${m(-budget.remaining)} over`}`]],
      columnStyles: { 1: { halign: "right", cellWidth: 90 } },
    });
  }

  heading("Itinerary");
  const fc = Object.fromEntries((live?.weather?.daily ?? []).map((d) => [d.date, d]));
  for (const day of plan.days) {
    ensure(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    doc.text(clean(`Day ${day.day} - ${day.date} - ${day.title}`), X, y);
    y += 14;
    const f = fc[day.date];
    para(`${day.area}. ${f ? `Forecast: ${wmoLabel(f.code)}, ${Math.round(f.tMin)}-${Math.round(f.tMax)} C, ${f.precipProb ?? 0}% rain. ` : ""}${day.weatherFit}`, {
      size: 9,
      gap: 4,
    });
    table({
      head: [["Time", "Stop", "Duration", "Cost pp", "Notes"]],
      body: day.activities.map((a) => [
        a.time,
        `${a.skipped ? "[skipped] " : ""}${a.title}${a.offbeat ? " (offbeat)" : ""}`,
        `${a.durationMin} min`,
        a.costPerPerson ? m(a.costPerPerson) : "Free",
        `${a.description} ${a.costNote ? `(${a.costNote})` : ""}`,
      ]),
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 120, fontStyle: "bold" }, 2: { cellWidth: 52 }, 3: { cellWidth: 60, halign: "right" } },
    });
    const meals = plan.food?.daily?.find((d) => d.day === day.day);
    if (meals) para(`Meals: ${["breakfast", "lunch", "dinner"].map((k) => `${k} - ${meals[k].dish} at ${meals[k].name} (${m(meals[k].costPerPerson)})`).join("; ")}`, { size: 9, gap: 3 });
    para(`Rain plan B: ${day.rainPlanB.summary} ${day.rainPlanB.swaps.map((s) => s.title).join(", ")}`, { size: 9, gap: 3, color: [30, 90, 160] });
    if (day.tip) para(`Tip: ${day.tip}`, { size: 9, gap: 10 });
  }

  if (plan.stays) {
    heading("Where to stay");
    const chosen = selectedStay(plan, choices);
    if (chosen) para(`Selected: ${chosen.name} (${chosen.area}) - ${m(chosen.pricePerNight)} per night for the group, est.`, { color: [11, 16, 32] });
    table({
      head: [["Tier", "Name", "Area", "Per night (group)", "Why"]],
      body: ["backpacker", "mid", "luxury"].flatMap((tier) => plan.stays.tiers[tier].map((s) => [tier, s.name, s.area, m(s.pricePerNight), s.why])),
      columnStyles: { 0: { cellWidth: 58 }, 3: { halign: "right", cellWidth: 72 } },
    });
  }

  if (plan.transport) {
    heading("Getting there & around");
    const t = selectedTravel(plan, choices);
    if (t) para(`Selected: ${t.mode} - ${t.summary} (${t.durationText}, ${m(t.costPerPersonRoundTrip)} pp round trip)`);
    table({
      head: [["Local option", "How", "Typical cost"]],
      body: plan.transport.local.map((l) => [l.mode, l.howTo, l.typicalCost]),
    });
    para(`Airport / station transfer: ${plan.transport.airportTransfer}`);
  }

  if (plan.food) {
    heading("Must-try food");
    table({
      head: [["Dish", "What it is", "Typical cost", "Diet"]],
      body: plan.food.mustTry.map((d) => [d.dish, d.description, m(d.typicalCost), [d.street ? "street food" : "", ...d.diet].filter(Boolean).join(", ")]),
      columnStyles: { 2: { halign: "right", cellWidth: 70 } },
    });
    para(`Diet: ${plan.food.dietNotes}  Water: ${plan.food.waterAndHygiene}  Tipping: ${plan.food.tipping}`, { size: 9 });
  }

  if (plan.extras) {
    const s = plan.extras.safety;
    heading("Safety & emergency");
    const liveNums = live?.country?.emergency ?? [];
    para(
      liveNums.length
        ? `Emergency numbers (Wikidata): ${liveNums.map((e) => `${e.number}${e.use ? ` ${e.use}` : ""}`).join(", ")}`
        : `Emergency numbers (verify locally): police ${s.emergency.police}, ambulance ${s.emergency.ambulance}, fire ${s.emergency.fire}`,
      { color: [170, 30, 30] },
    );
    s.tips.forEach((t) => para(`- ${t}`, { size: 9, gap: 2 }));
    y += 6;
    if (s.scams.length) {
      table({ head: [["Scam", "How it works", "How to avoid it"]], body: s.scams.map((sc) => [sc.name, sc.how, sc.avoid]) });
    }
    heading("Money-saving hacks");
    plan.extras.moneyHacks.forEach((h) => para(`- ${h.hack} (${h.saves})`, { size: 9, gap: 2 }));
    y += 6;
    heading("Packing list");
    plan.extras.packing.forEach((g) => para(`${g.category}: ${g.items.join(", ")}`, { size: 9, gap: 4 }));
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 144, 160);
    doc.text("Costs are estimates - verify prices, hours and fees before booking. Generated by Waypoint with live open data + Claude.", X, H - 24);
    doc.text(`${i} / ${pages}`, W - X, H - 24, { align: "right" });
  }

  const slug = clean(request.destination.name).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "trip";
  doc.save(`waypoint-${slug}-${request.startDate}.pdf`);
}
