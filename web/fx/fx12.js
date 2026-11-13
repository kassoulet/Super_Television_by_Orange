// effect 12 (0x47e79): Marilyn portrait (chunk 26) appears at order 37 row 24 and fades out, fade 256 -> 0 at one step per frame
// (palette = src*fade>>8). Pure function of t.
import {at} from './timeline.js';
import {VSYNC,rix,setPal} from './common.js';
let img=null;
export async function init(assets){img=rix(assets?assets[26]:await (await fetch('assets/26.bin')).arrayBuffer())}
export function render(t,ctx){
  const ts=at(37,24); if(t<ts)return false;
  const ph=ctx.phase||0,m=Math.floor((t-ph)*VSYNC)-Math.ceil((ts-ph)*VSYNC);     // vsyncs since the picture appeared
  ctx.idx.set(img.pix); setPal(ctx,img.pal,Math.max(0,256-Math.max(0,m))); return true}
