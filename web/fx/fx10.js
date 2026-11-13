// effect 10 (0x4a62f) "bump-mapped texture": chunk 19 (320x200 texture) is sampled at 4 sine-driven positions (8 counters 0x6b34c.., +4 per ISR tick from
// 0,1024,2048,3072,1024,2048,3072,0), the 4 dwords are added and >>2 &0x3f3f3f3f -> HB (160x100); a gradient map G=-(5*64*dy)-dx (dy/dx = signed byte
// differences of HB at +-4 rows / +-4 columns) offsets a lookup in chunk 20 (4 bit, <<4); 160x90 source pixels become 2x2 blocks at y=10 and each frame writes only one diagonal of the
// blocks (frame parity), so the picture is f(frame k, frame k-1). Palette[16*r+c] = (pal20[r]*pal19[c]>>4)*fade>>8 clamped to 63 (r, c = first 16 colours of chunks 20 and 19); fade (0x6bc9d) +1 per tick up to 256 then -1 per tick from order 34 row 34.
// Only the 2 last frames matter (every pixel is rewritten every 2 frames), so render(t) draws frames k-1 and k. UNRESOLVED (not derivable from the code): the entry time (the previous effect leaves at order 31 or after 350 frames, machine dependent) and the frame rate
// (CPU bound, 1 frame per >=1 vsync): the port uses entry=at(31,0) and FPS=35.
import {at} from './timeline.js';
import {to8} from './common.js';
export const FPS=35, TICK_HZ=1193182/17045, ENTER=[31,0];
let SIN,T19,T20,P19,P20;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  SIN=new Int32Array((await get('fx10','fx10.bin')).slice().buffer);
  const a=await get(19,'19.bin'), b=await get(20,'20.bin'); P19=a.subarray(10,778); P20=b.subarray(10,778);
  T19=a.subarray(0x30a); T20=b.subarray(0x30a).map(v=>v<<4);
}
const C0=[0,1024,2048,3072,1024,2048,3072,0];
const c20=i=>i>=0&&i<64000?T20[i]:0;   // outside the picture the original reads zeroed heap (to be confirmed by the oracle)
// st = {n: ticks since entry, fade}; vram = Uint8Array(64000) kept between frames; parity = frame number & 1
export function draw(st,vram,parity){
  const c=C0.map(v=>(v+4*st.n)&0xfff), tap=[0,1,2,3].map(i=>(((SIN[c[4+i]]*50)>>10)+50)*320+(((SIN[c[i]]*80)>>10)+80));
  const HB=new Uint8Array(16000), dv=new DataView(T19.buffer,T19.byteOffset,T19.length), hv=new DataView(HB.buffer);
  for(let r=0;r<100;r++)for(let j=0;j<40;j++){let s=0;for(const p of tap)s=(s+dv.getUint32(p+r*320+4*j,true))>>>0;hv.setUint32(r*160+4*j,(s>>>2)&0x3f3f3f3f,true)}
  const sb=x=>(x<<24)>>24;
  for(let r=0;r<90;r++)for(let col=0;col<160;col++){
    const i=800+r*160+col, g=(-sb(HB[i+640]-HB[i-640])*5<<6)+(-sb(HB[i+4]-HB[i-4])), h=HB[r*160+col], e=parity?1:0;
    const s=0xc80+r*640+2*col+e+g, d=(10+2*r)*320+2*col+e, a=h|c20(s);
    vram[d]=a; if(parity)vram[d+319]=(a&15)|c20(s+319); else vram[d+321]=(a&15)|c20(s+321)}
}
export function palette(st,ctx){for(let r=0;r<16;r++)for(let c=0;c<16;c++)for(let k=0;k<3;k++){let v=(((P20[r*3+k]*P19[c*3+k]*256)>>>12)*st.fade)>>8;ctx.pal[(r*16+c)*3+k]=to8(v>63?63:v)}}   // entry r*16+c = chunk 20 colour r x chunk 19 colour c (0x4a8a3 loops)
function fadeAt(N,te){let f=0;const tf=at(34,34);for(let k=1;k<=N;k++){if(f!==256)f++;if(te+k/TICK_HZ>=tf&&f>=2)f-=2}return f}
export function render(t,ctx){
  const te=at(...ENTER); if(t<te)return false;
  const k=Math.floor((t-te)*FPS), N=j=>Math.floor(j/FPS*TICK_HZ), vram=new Uint8Array(64000);
  if(k>0)draw({n:N(k-1)},vram,(k-1)&1);   // the other diagonal comes from the previous frame
  draw({n:N(k)},vram,k&1);
  ctx.idx.set(vram); palette({fade:fadeAt(N(k),te)},ctx); return true}
