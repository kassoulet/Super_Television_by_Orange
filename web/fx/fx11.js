// effect 11 (0x47d60) "sepia + text": chunk 20 (picture, own 6-bit palette, no fade) with chunk 27 (320x600 text strip) over it: every frame copies
// 64000 pixels, taking the strip pixel at offset (n>>1)*320 + i when it is non zero. n = [0x5f498], +1 per ISR tick (hook 0x47e72, ISR installed at the effect entry 0x1c3de..),
// no cap: past the strip's end the original reads zeroed heap (to be confirmed by the oracle). Pure function of n.
// Entry = previous effect leaves at order 35 (0x4a973: cmp order,0x23). UNRESOLVED (machine dependent): fx10's frame latency and the PIT phase (<1 tick): n = floor((t-at(35,0))*TICK_HZ).
import {at} from './timeline.js';
import {setPal} from './common.js';
export const TICK_HZ=1193182/17045;
let BG,TXT,PAL;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const a=await get(20,'20.bin'), b=await get(27,'27.bin'); PAL=a.subarray(10,778); BG=a.subarray(0x30a,0x30a+64000); TXT=b.subarray(0x30a);
}
export function draw(n,idx){const o=(n>>1)*320; for(let i=0;i<64000;i++){const v=TXT[o+i]|0; idx[i]=v?v:BG[i]}}
export function render(t,ctx){
  const te=at(35,0); if(t<te)return false;
  draw(Math.floor((t-te)*TICK_HZ),ctx.idx); setPal(ctx,PAL,256); return true}
