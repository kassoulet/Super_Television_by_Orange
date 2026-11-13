// effect 2 (0x476b4) "TV lens": two 512x512 texture windows (chunk 2 >>1) are summed per pixel (al = t1+t2), the sum indexes a 256x256
// lens table (TBL[row*256+col] = ((row-128)*(256-col)>>8)+0x80) twice (row 0x1c+y and column x), the pair (dh,dl) addresses chunk 6 (RIX3 picture + palette)
// and chunk 7 maps (al>>2, that pixel) to the final index. 256x200 picture centred (x=48..303) in 320x200.
// The master ISR (hook at 0x4799b) advances: A+=0x20, B+=0x1a, C+=0x18 (mod 4096; sine table at 0x4f687, cosine = +1025 entries),
// picture scroll-in off=0xc800-0x500*k from order 11 (40 ticks), fade 256-8*k from order 12 row 48. State = pure function of the tick count N, no accumulation.
// N = ISR ticks since the effect was entered (the per-effect ISR 0x1bebc is installed at entry, 0x1c32e: golden A=32N, B=26N, C=24N exactly). Entry = the previous effect's exit:
// fx1 (0x4705f) leaves when its fade [0x557f8] (256, -6 per tick from order 10 row 47, hook 0x473ef) reaches 0 = after ceil(256/6)=43 ticks. UNRESOLVED (machine dependent, not derivable from the code): the PIT phase (<1 tick) and fx1's loop latency (it only tests the fade once per frame), so N is only known up to a few ticks.
import {at} from './timeline.js';
import {setPal} from './common.js';
export const TICK_HZ=1193182/17045;   // PIT divisor 0x4295 (main 0x1c2de/0x1be10), IRQ0 rate
let SIN,TEX,C6,PAL,C7,TBL;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const s=get('fx02','fx02.bin'); SIN=new Int32Array((await s).slice().buffer);
  TEX=(await get(2,'02.bin')).map(v=>v>>1); C6=await get(6,'06.bin'); PAL=C6.subarray(10,778);   // chunk 6 addressed from the file start (header included): the demo only replaces the low 16 bits of an aligned pointer
  C7=await get(7,'07.bin'); TBL=new Uint8Array(65536);
  for(let r=0;r<256;r++)for(let c=0;c<256;c++)TBL[r*256+c]=(((r-128)*(256-c))>>8)+0x80;
}
// st = {A,B,C,off,fade}; fills the 256x200 picture (rows < off/256 black) into idx (stride 320, x0=48)
export function draw(st,idx){
  const m1=SIN[st.A]+0x4c8, m2=SIN[st.B]+0x4c8, c2=(st.C+0x800)&0xfff;
  const p1=(((SIN[st.C+1025]*m1)>>14)+0x80<<9)+((SIN[st.C]*m1)>>14)+0x80, p2=(((SIN[c2+1025]*m2)>>14)+0x80<<9)+((SIN[c2]*m2)>>14)+0x80;
  idx.fill(0); const y0=st.off>>8;
  for(let y=y0;y<200;y++){const r=y-y0, o=y*320+48;
    for(let x=0;x<256;x++){
      const al=((TEX[p1+0x3800+r*512+x]|0)+(TEX[p2+0x3800+r*512+x]|0))&255;
      idx[o+x]=C7[((al>>2)<<8)+C6[(TBL[(0x1c+r)*256+al]<<8)+TBL[x*256+al]]]}}}
export function render(t,ctx){
  const N=Math.floor((t-at(10,47))*TICK_HZ-43), k=Math.max(0,Math.floor((t-at(11,0))*TICK_HZ)), tf=at(12,48);
  const fade=t<tf?256:Math.max(0,256-8*Math.floor((t-tf)*TICK_HZ));
  draw({A:(0x20*N)&0xfff,B:(0x1a*N)&0xfff,C:(0x18*N)&0xfff,off:Math.max(0,0xc800-0x500*k),fade},ctx.idx);
  setPal(ctx,PAL,fade); return true}
