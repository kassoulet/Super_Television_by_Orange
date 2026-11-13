// effect 5 (0x495c1) "bump ball": mode 13h, 160x100 picture drawn as 2x2 quincunx blocks (0x49922..0x4996d), then one overlay pass (chunk 21, index 0xf0 transparent) and a palette fade.
// Setup (0x4968e..0x497d5): height h[i] = TBL[(r+g+b)&255] of chunk 10's palette entry of picture pixel i (64K), 4 box blurs (0x4971f, dword arithmetic: byte = (sum of 4 neighbours>>2)&0x3f, 16-bit wrapped
// addresses inside the 64K block, the dword reads at offsets 0xffff/0xfffd read 3/1 bytes BEYOND the block = XT), then D[i] = word((h[i-1]-h[i+1])<<2 &255, (h[i-256]-h[i+256])<<2 &255).
// Per frame (render 0x49552): for pixel i of the 160x100 grid, w = chunk5 word i, dx = w+OFF (16 bit), cl = chunk10[dx], bp = w + D[dx], ch = chunk17[bp], out = chunk11[ch<<8|cl].
// ISR 0x49adf (70 Hz): OFF = ((A>>4)<<8)+(B>>4) with A,B += crossfaded per-order parameters (table 0x607aa); [0x61026] = 0x180 on some rows then -4 down to 0x100; [0x60ffe] +1 up to 0x100 (reset to 4 at loop start).
// Palette = chunk10 palette (entries 240..255 = chunk 21 palette) * ([0x60ffe]*[0x61026]) >> 16, clamp 63. Order 21 row>=2: overlay composite, then 256 fade frames (scale 0x200 .. 2, >>8).
import {pos,at} from './timeline.js';
import {to8,VSYNC} from './common.js';
export const TICK_HZ=1193182/17045;
export const NINIT=11, RESET=12, TPF=2, XT=[[0,0,0],[0,0,0]];   // harness-measured (tools/fx5check.mjs; tick 12 = first sample, [0x60ffe] reset to 4 there), UNRESOLVED on real hardware (see re/NOTES.md); XT = bytes after the 64K blocks, XT[pass&1]
let TB,PAR,W5,I10,T11,I17,OV,PAL,D;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const f=await get('fx05','fx05.bin'); TB=f.slice(0,256); PAR=new Int32Array(f.slice(256,256+480).buffer);
  const c5=await get(5,'05.bin'); W5=new Uint16Array(c5.slice(0,32000).buffer);
  const c10=await get(10,'10.bin'); I10=c10.slice(0x30a,0x30a+65536); PAL=c10.slice(10,10+768);
  T11=(await get(11,'11.bin')).slice(0,65536); I17=(await get(17,'17.bin')).slice(0x30a,0x30a+65536);
  const c21=await get(21,'21.bin'); OV=c21.slice(0x30a,0x30a+64000).map(v=>v+0xf0);
  let h=new Uint8Array(65536); for(let i=0;i<65536;i++){const c=I10[i]*3;h[i]=TB[(PAL[c]+PAL[c+1]+PAL[c+2])&255]}
  PAL.set(c21.subarray(10,58),720);
  for(let p=0;p<4;p++){const o=new Uint8Array(65536),X=XT[p&1];
    for(let i=0;i<65536;i++){
      const l=i>=1&&i<=3?X[i-1]:h[(i-1)&0xffff], r=i===0xffff?X[0]:h[(i+1)&0xffff];
      o[i]=((l+r+h[(i+256)&0xffff]+h[(i-256)&0xffff])>>2)&0x3f}
    h=o}
  D=new Uint16Array(65536); for(let i=0;i<65536;i++)D[i]=(((h[(i-1)&0xffff]-h[(i+1)&0xffff])<<2)&255)|((((h[(i-256)&0xffff]-h[(i+256)&0xffff])<<2)&255)<<8);
}
export const newS=()=>({a:1024,b:1024,off:0,last:0,p9e:256,p7a:0,f26:256,f0e:0,n:0});
const R5=new Set([0x3f,2,5,0x21,0x24,0x27]);
export function isrStep(S,order,row){
  if(R5.has(row))S.f26=0x180;
  if(S.f26!==0x100)S.f26-=4;
  if(S.f0e!==0x100)S.f0e++;
  if(order!==S.last){S.p9e=0x100;S.p7a=0}
  S.last=order;
  if(S.p9e!==0){S.p9e--;S.p7a++}
  const e=order*5,g=e+5;
  const x=(Math.imul(PAR[e],S.p9e)+Math.imul(PAR[g],S.p7a))>>>8, y=(Math.imul(PAR[e+1],S.p9e)+Math.imul(PAR[g+1],S.p7a))>>>8;
  S.b=(S.b+y)|0; S.a=(S.a+x)|0;
  S.off=((((S.a>>4)<<8)+(S.b>>4))&0xffff); S.n++;
}
export function ball(off,out){
  for(let i=0;i<16000;i++){const w=W5[i],dx=(w+off)&0xffff;out[i]=T11[(I17[(w+D[dx])&0xffff]<<8)|I10[dx]]}
}
// 0x49922 (ov=null) / 0x49993 (overlay): V = 64000 VRAM bytes
export function blit(buf,V,ov){
  let s=1,e=2;
  for(let r=0;r<100;r++){
    for(let c=0;c<158;c++){const a=buf[s++];
      for(const o of [0,3,318,321])V[e+o]=ov&&ov[e+o]!==0xf0?ov[e+o]:a;
      e+=2}
    e+=0x144;s+=2}
}
export function palette(f,sh,pal){for(let i=0;i<768;i++){const v=(PAL[i]*f)>>sh;pal[i]=to8(v>63?63:v)}}
export const overlay=()=>OV;
let te;
export const entry=()=>(te??=at(17,0));
export function stateAt(n){const S=newS();for(let j=1;j<=n;j++){const p=pos(entry()+j/TICK_HZ);isrStep(S,p.order,p.row);if(j===RESET)S.f0e=4}return S}
// pass k starts at tick NINIT+k*TPF (harness: first pass at tick 12, then 2 ticks per pass with a drift of -1 tick per ~400 passes: 871 of 879 passes take 2). The loop ends after the pass that is running when order 21 starts (0x4996f); it spins to row 2 (screen and palette unchanged), then the overlay and 256 fade frames, one per vsync (0x49a55)
export function render(t,ctx){
  const t0=entry(),tf=at(21,2),KL=Math.ceil(((at(21,0)-t0)*TICK_HZ-NINIT)/TPF)-1,V=ctx.idx,B=new Uint8Array(16000); V.fill(0);
  const k=Math.min(Math.floor(((t-t0)*TICK_HZ-NINIT)/TPF),KL); if(k<0){ctx.pal.fill(0);return false}
  const S=stateAt(NINIT+k*TPF); ball(S.off,B); blit(B,V,null);
  if(t<tf){palette(S.f0e*S.f26,16,ctx.pal);return true}
  const j=Math.floor((t-tf)*VSYNC); if(j>=256){ctx.pal.fill(0);return false}
  blit(B,V,OV);palette(0x200-2*j,8,ctx.pal);return true}
