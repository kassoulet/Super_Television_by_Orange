// shared helpers for the stv effects. Frame contract: render(t, ctx) fills ctx.idx (Uint8Array 64000, 320x200 indexed)
// and ctx.pal (Uint8Array 768, 8-bit RGB = 6-bit VGA value *255/63 floored); returns false if the effect is not on screen at t.
// t = music seconds since the start of effect 0 (see timeline.js).
export const VSYNC=70.086;                       // VGA 70 Hz (the effects pace on port 0x3da)
export const to8=v=>Math.floor(v*255/63);
export function rix(buf){const d=new Uint8Array(buf);return{pal:d.subarray(10,10+768),pix:d.subarray(0x30a,0x30a+64000)}}
export function setPal(ctx,pal6,fade){ // pal*fade>>8 clamped to 63 (the demo's fade loop)
  for(let i=0;i<768;i++){let v=(pal6[i]*fade)>>8;if(v>63)v=63;ctx.pal[i]=to8(v)}}
