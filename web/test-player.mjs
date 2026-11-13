import assert from 'node:assert/strict';
import { FX, DUR, fxAt, displaySize } from './timetable.js';
assert.equal(FX.length, 13);
const st = FX.map(e => e.t0);
FX.forEach((e, i) => assert.ok(Math.abs(e.t0 - [0,60,76,90,102,115,144,153,159,175,202,230,244][i]) < 0.5));   // vs the rounded golden-log times
st.forEach((s, i) => { assert.equal(fxAt(s), i); assert.equal(fxAt(s + 0.01), i); if (i) assert.equal(fxAt(s - 0.01), i - 1); });
assert.equal(fxAt(DUR - 0.01), 12); assert.equal(FX[12].t1, 252);
let d = displaySize(1000, 1000, 1); assert.deepEqual(d, { w: 960, h: 720 });          // 3x320, 4:3
d = displaySize(1920, 600, 1); assert.equal(d.w, 640); assert.equal(d.h, 480);          // height-bound
d = displaySize(300, 900, 1); assert.equal(d.w, 300); assert.equal(d.h, 225);           // <1x: fit
d = displaySize(700, 900, 2); assert.equal(d.w, 640); assert.equal(d.h, 480);   // dpr2: 4x device px
console.log('ok');
