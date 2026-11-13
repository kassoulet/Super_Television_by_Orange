// Pure helpers (no DOM): effect timetable + 4:3 display sizing. Tested by test-player.mjs.
export const DUR = 252;
import {at} from './fx/timeline.js';
// effect routine entry = S3M (order,row) seen by the emulator harness (re/golden/log.txt); times from the libopenmpt-derived timeline
export const FX = [
  [0, 0, 'intro'], [8, 20, 'eye'], [10, 54, 'TV logo'], [13, 0, 'geometry'], [15, 0, 'orange TV'], [17, 1, 'bump ball'], [21, 42, 'Bob Marley'],
  [23, 0, 'flag/palm'], [24, 0, 'swirl'], [26, 32, 'TV static'], [31, 0, 'organic texture'], [35, 1, 'sepia text'], [37, 0, 'Marilyn'],
].map(([o, r, name], i, a) => ({ i, t0: at(o, r), t1: i + 1 < a.length ? at(a[i + 1][0], a[i + 1][1]) : DUR, name }));
export const fxAt = t => { let k = 0; for (const e of FX) if (t >= e.t0) k = e.i; return k; };
export const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// Display size in CSS px for a 320x200 source shown at 4:3: integer multiple of 320 device px when >=1, else fit.
export function displaySize(availW, availH, dpr = 1) {
  const fitW = Math.min(availW, availH * 4 / 3) * dpr, k = Math.floor(fitW / 320);
  const w = (k >= 1 ? 320 * k : fitW) / dpr;
  return { w, h: w * 3 / 4 };
}
