// Calculs de cycle et de dates, sans DOM : testables avec `npm test`.
//
// Toutes les dates sont manipulees en heure LOCALE. new Date("YYYY-MM-DD") et
// toISOString() travaillent en UTC, ce qui decale d'un jour en
// Nouvelle-Caledonie (UTC+11).

export const DAY = 86400000;
export const PREGNANCY_DAYS = 280;
// Fenetre fertile : 5 jours avant l'ovulation jusqu'au lendemain.
export const FERTILE_BEFORE = 5;
export const FERTILE_AFTER = 1;
// Probabilite de conception par jour relatif a l'ovulation (Wilcox et al.).
export const FERTILE_PROBS = [
  { d: -5, p: 10 }, { d: -4, p: 16 }, { d: -3, p: 27 }, { d: -2, p: 33 },
  { d: -1, p: 41 }, { d: 0, p: 33 }, { d: 1, p: 5 },
];

export function parseD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function diffDays(a, b) {
  return Math.round((a - b) / DAY);
}
export function todayD() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sortPeriods(periods) {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start));
}

// Duree de cycle utilisee partout (projections, ovulation, phase) :
// moyenne mesuree entre les debuts de regles, sinon le reglage.
export function avgCycle(periods, settings) {
  const s = sortPeriods(periods);
  if (s.length < 2) return settings.cycle;
  return Math.round(diffDays(parseD(s[s.length - 1].start), parseD(s[0].start)) / (s.length - 1));
}

// Duree moyenne des regles dont la fin est renseignee, sinon le reglage.
export function avgPeriodLength(periods, settings) {
  const withEnd = periods.filter((p) => p.end);
  if (!withEnd.length) return settings.period;
  const total = withEnd.reduce((sum, p) => sum + diffDays(parseD(p.end), parseD(p.start)) + 1, 0);
  return Math.round(total / withEnd.length);
}

function daysFrom(start, count, set) {
  const st = parseD(start);
  for (let i = 0; i < count; i++) set.add(ymd(addDays(st, i)));
  return set;
}

// Jours de regles enregistres ("YYYY-MM-DD").
export function periodDays(periods, settings) {
  const s = new Set();
  periods.forEach((p) => daysFrom(p.start, p.end ? diffDays(parseD(p.end), parseD(p.start)) + 1 : settings.period, s));
  return s;
}

// Prochaines regles prevues : [{ start, dur }].
export function projections(periods, settings) {
  if (!periods.length) return [];
  const sorted = sortPeriods(periods);
  const avg = avgCycle(periods, settings);
  const last = parseD(sorted[sorted.length - 1].start);
  return Array.from({ length: settings.proj }, (_, i) => ({ start: ymd(addDays(last, avg * (i + 1))), dur: settings.period }));
}

export function projectedDays(periods, settings) {
  const s = new Set();
  projections(periods, settings).forEach((p) => daysFrom(p.start, p.dur, s));
  return s;
}

// Ovulation estimee 14 jours avant les regles suivantes, pour chaque cycle
// enregistre ou prevu.
export function ovulationDates(periods, settings) {
  const c = avgCycle(periods, settings);
  return [...periods.map((p) => p.start), ...projections(periods, settings).map((p) => p.start)]
    .map((st) => addDays(parseD(st), c - 14));
}

// { f: jours fertiles, ov: jours d'ovulation } ("YYYY-MM-DD").
export function fertileDays(periods, settings) {
  const f = new Set(), ov = new Set();
  ovulationDates(periods, settings).forEach((ovd) => {
    ov.add(ymd(ovd));
    for (let i = -FERTILE_BEFORE; i <= FERTILE_AFTER; i++) f.add(ymd(addDays(ovd, i)));
  });
  ov.forEach((k) => f.delete(k));
  return { f, ov };
}

// Ovulation en cours ou a venir la plus proche, sinon la derniere passee.
export function nearestOvulation(periods, settings, today = todayD()) {
  const all = ovulationDates(periods, settings);
  const future = all.filter((d) => diffDays(d, today) >= 0).sort((a, b) => a - b);
  if (future.length) return future[0];
  const past = all.sort((a, b) => b - a);
  return past[0] || null;
}

// Etape du conseil de conception selon le nombre de jours avant l'ovulation.
export function conceptionStage(daysToOv) {
  if (daysToOv > 7) return "follicular";
  if (daysToOv >= 5) return "soon";
  if (daysToOv >= 3) return "open";
  if (daysToOv === 2) return "d2";
  if (daysToOv === 1) return "d1";
  if (daysToOv === 0) return "d0";
  return "luteal";
}

// Jour du cycle en cours (0 = premier jour des dernieres regles), sans modulo :
// au-dela de la duree du cycle, les regles sont en retard.
export function cycleDay(periods, settings, today = todayD()) {
  if (!periods.length) return null;
  const s = sortPeriods(periods);
  const day = diffDays(today, parseD(s[s.length - 1].start));
  if (day < 0) return null;
  const cycle = avgCycle(periods, settings);
  return { day, cycle, late: Math.max(0, day + 1 - cycle) };
}

// 0 menstruation, 1 folliculaire, 2 ovulation, 3 luteale (aussi en cas de retard).
export function phaseIndex(day, cycle, periodLen) {
  const ovDay = cycle - 14;
  if (day < periodLen) return 0;
  if (day < ovDay - 1) return 1;
  if (day <= ovDay + 1) return 2;
  return 3;
}

export function pregnancyInfo(pregStartDate, today = todayD()) {
  if (!pregStartDate) return null;
  const start = parseD(pregStartDate);
  const days = Math.max(0, diffDays(today, start));
  const dpa = addDays(start, PREGNANCY_DAYS);
  return { weeks: Math.floor(days / 7), rem: days % 7, dpa, daysLeft: diffDays(dpa, today), days };
}

export function pregnancyDays(pregStartDate) {
  return pregStartDate ? daysFrom(pregStartDate, PREGNANCY_DAYS + 1, new Set()) : new Set();
}
