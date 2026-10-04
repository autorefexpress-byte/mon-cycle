import { test } from "node:test";
import assert from "node:assert/strict";
import { isDate, validate } from "../lib/validate.js";

const ok = { periods: [{ start: "2026-09-02", end: "2026-09-06" }], settings: { cycle: 30, period: 5, proj: 3 }, mode: "normal", pregStartDate: null, version: 3 };

test("isDate", () => {
  assert.ok(isDate("2028-02-29"));
  for (const s of ["2026-02-30", "2026-13-01", "2026-9-1", "", null, 20260901]) assert.ok(!isDate(s), String(s));
});

test("corps valide nettoye (champs inconnus retires)", () => {
  const r = validate({ ...ok, periods: [{ start: "2026-09-02", end: null, extra: "<script>" }] });
  assert.deepEqual(r.periods, [{ start: "2026-09-02", end: null }]);
  assert.equal(r.version, 3);
});

test("reglages absents : valeurs par defaut ; version absente : null", () => {
  const r = validate({ ...ok, settings: {}, version: undefined });
  assert.deepEqual(r.settings, { cycle: 28, period: 5, proj: 3 });
  assert.equal(r.version, null);
});

test("corps invalides refuses", () => {
  const cases = {
    "invalid body": null,
    "invalid periods": { ...ok, periods: Array(1001).fill({ start: "2026-01-01" }) },
    "invalid period start": { ...ok, periods: [{ start: "hier" }] },
    "invalid period end": { ...ok, periods: [{ start: "2026-09-02", end: "2026-09-01" }] },
    "invalid settings.cycle": { ...ok, settings: { cycle: 99 } },
    "invalid settings.period": { ...ok, settings: { period: 2.5 } },
    "invalid mode": { ...ok, mode: "admin" },
    "invalid pregStartDate": { ...ok, pregStartDate: "2026-02-30" },
    "invalid version": { ...ok, version: -1 },
  };
  for (const [err, body] of Object.entries(cases)) assert.equal(validate(body), err);
});
