// effect 8 (0x4856a -> engine 0x485b0 in swirl.js, [0x5f487]==1 since effect 3 left). Entry = exit of effect 7 (order 24). Inherits the ISR variables [0x5d27a/5d26e/5d272/5d276] of effect 3's end (0x4856a does not reset them).
import {at} from './timeline.js';
import {init,render as r,endState,isrStep} from './swirl.js';
import {TE} from './fx03.js';
export {init};
// EXIT=8: ticks of effect 3's ISR between the last loop pass and fx8's first frame (exit code + fx4..fx7 are not what advances them): measured in the harness (w1 100 -> 68 = 8 ticks), machine dependent, UNRESOLVED
const EXIT=8; let S0; const E8=at(24,0);
const carry=()=>{const s=endState(3,TE).S;for(let j=0;j<EXIT;j++)isrStep(s,3,0,0);return {...s,f483:256,f47f:0,off:0}};
export const render=(t,ctx)=>r(8,E8,S0??=carry(),t,ctx);
