// effect 3 (0x485b0, engine in swirl.js). Entry = exit of effect 2 (its loop leaves when order 13 is reached, 0x4794e). Start-up ticks NINIT and the sub-frame phase are UNRESOLVED (machine dependent).
import {at} from './timeline.js';
import {init,render as r} from './swirl.js';
export {init};
export const TE=at(13,0);
export const render=(t,ctx)=>r(3,TE,null,t,ctx);
