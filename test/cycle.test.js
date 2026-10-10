import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseD, ymd, addDays, avgCycle, avgPeriodLength, periodDays, projections, fertileDays,
  nearestOvulation, conceptionStage, cycleDay, phaseIndex, pregnancyInfo,
} from "../js/cycle.js";

const settings = { cycle: 28, period: 5, proj: 3 };
const p32 = [{ start: "2026-08-01", end: "2026-08-05" }, { start: "2026-09-02", end: "2026-09-06" }];

test("le fuseau horaire des tests est bien Noumea (UTC+11)", () => {
  assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), -660);
});

test("parseD / ymd restent sur le meme jour en heure locale", () => {
  assert.equal(ymd(parseD("2026-10-05")), "2026-10-05");
  assert.equal(parseD("2026-10-05").getHours(), 0);
  assert.equal(ymd(addDays(parseD("2026-12-31"), 1)), "2027-01-01");
});

test("duree de cycle : reglage si moins de 2 cycles, sinon moyenne mesuree", () => {
  assert.equal(avgCycle([{ start: "2026-09-02" }], settings), 28);
  assert.equal(avgCycle(p32, settings), 32);
});

test("duree des regles : moyenne des fins renseignees, sinon reglage", () => {
  assert.equal(avgPeriodLength([{ start: "2026-09-02", end: null }], settings), 5);
  assert.equal(avgPeriodLength(p32, settings), 5);
});

test("jours de regles", () => {
  const d = periodDays([{ start: "2026-09-29", end: "2026-10-02" }, { start: "2026-10-30", end: null }], settings);
  assert.deepEqual([...d], ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
});

test("projections avec la duree moyenne", () => {
  assert.deepEqual(projections(p32, settings).map((p) => p.start), ["2026-10-04", "2026-11-05", "2026-12-07"]);
  assert.deepEqual(projections([], settings), []);
});

test("ovulation 14 jours avant les regles suivantes, meme duree que les projections", () => {
  const { f, ov } = fertileDays(p32, settings);
  assert.ok(ov.has("2026-09-20")); // 2 sept + 32 - 14
  assert.ok(!ov.has("2026-09-16")); // ancien calcul (reglage 28)
  for (const d of ["2026-09-15", "2026-09-19", "2026-09-21"]) assert.ok(f.has(d), d);
  assert.ok(!f.has("2026-09-20"), "le jour d'ovulation n'est pas compte deux fois");
  assert.ok(!f.has("2026-09-22"));
});

test("ovulation la plus proche", () => {
  assert.equal(ymd(nearestOvulation(p32, settings, parseD("2026-09-21"))), "2026-10-22");
  assert.equal(ymd(nearestOvulation(p32, settings, parseD("2026-09-20"))), "2026-09-20");
  assert.equal(nearestOvulation([], settings, parseD("2026-09-20")), null);
});

test("etapes du conseil de conception", () => {
  assert.deepEqual([10, 6, 4, 2, 1, 0, -3].map(conceptionStage), ["follicular", "soon", "open", "d2", "d1", "d0", "luteal"]);
});

test("jour du cycle sans retour a zero en cas de retard", () => {
  assert.deepEqual(cycleDay(p32, settings, parseD("2026-09-02")), { day: 0, cycle: 32, late: 0 });
  assert.deepEqual(cycleDay(p32, settings, parseD("2026-10-05")), { day: 33, cycle: 32, late: 2 });
  assert.equal(cycleDay(p32, settings, parseD("2026-09-01")), null);
  assert.equal(cycleDay([], settings), null);
});

test("phases alignees sur l'ovulation, phase luteale en cas de retard", () => {
  const ph = (day) => phaseIndex(day, 28, 5);
  assert.deepEqual([0, 4, 5, 12, 13, 14, 15, 16, 27, 40].map(ph), [0, 0, 1, 1, 2, 2, 2, 3, 3, 3]);
});

test("grossesse : semaines, jours restants, date prevue", () => {
  const info = pregnancyInfo("2026-08-03", parseD("2026-10-05"));
  assert.equal(info.weeks, 9);
  assert.equal(info.rem, 0);
  assert.equal(ymd(info.dpa), "2027-05-10");
  assert.equal(info.daysLeft, 217);
  assert.equal(pregnancyInfo(null), null);
});
