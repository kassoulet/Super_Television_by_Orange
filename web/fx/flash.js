// "picture + beat flash" effect (effects 6 and 7, code 0x47f86 / 0x48209): a RIX3 picture is copied to VRAM with a black palette;
// every frame (vsync) the row byte is polled, on a listed row the fade is set to 0x180 and then drops by 16 per frame,
// palette = src*fade>>8 (clamped 63). Pure function of t: fade = 0x180-16*(frames since the last flash row was first seen).
import {pos,at} from './timeline.js';
import {VSYNC,rix,setPal} from './common.js';
export function makeFlash({chunk,enter,leave,rows,url='assets/'}){
  let img=null; const when=[]; // start time of each flash row inside [enter,leave)
  return{
    async init(assets){img=rix(assets?assets[chunk]:await (await fetch(url+String(chunk).padStart(2,'0')+'.bin')).arrayBuffer());
      for(let o=enter;o<leave;o++)for(const r of rows)when.push(at(o,r));when.sort((a,b)=>a-b)},
    render(t,ctx){
      const t0=at(enter,0),t1=at(leave,0); if(t<t0||t>=t1)return false;
      ctx.idx.set(img.pix);
      const ph=ctx.phase||0;                      // vsync grid phase (seconds); the real one depends on the display
      const k=Math.floor((t-ph)*VSYNC);                // vsync whose palette is on screen
      const s=(k-1)/VSYNC+ph;                        // iteration k sampled the row just after the previous vsync
      let ts=-1;for(const w of when){if(w<=s)ts=w;else break}
      let fade=0;if(ts>=0){const j0=Math.ceil((ts-ph)*VSYNC)+1;fade=Math.max(0,0x180-16*(k-j0));if(k<j0)fade=0}
      setPal(ctx,img.pal,fade);return true}}}
