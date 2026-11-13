// effect 4 (0x4917b) "orange TV, distortion": mode 13h. T = 320x200 picture (chunk 14, 6 bit; the demo's feedback buffer 0x5fe1f, zero outside), per frame (loop 0x492b4):
// two offset tables (0x48f1a: H[320] 0x60168, V[200] 0x5fe48) from the ISR counters A..D [0x5f4c0..cc] and amplitude [0x5f4a0]: D[y*320+x] = T[V[y]+H[x]] (0x490e4);
// then T = (3*D + C)>>2 per byte (C = chunk 14, constant) and the VRAM byte = (T>>2 & 15) | chunk15 pixel<<4 (0x49128, dword arithmetic as in the code);
// palette (0x4931f): out[o*16+i] = ((P2[i]*F>>8)*9 + P1[o]*6)>>3 (<=63) * F >> 8 with P1 = chunk 15 palette, P2 = 0x5f81f, F = fade [0x60698].
// STATEFUL: T is a recursion over all frames since the entry; render(t) replays from the first frame (cached, forward continues; ~2 ms/frame).
// ISR (0x49459, PIT 70.0027 Hz): A+=9, B-=38, C-=26, D+=25 (&0xfff), [0x5f817]+=2, E+=3 -> [0x5f4a0]=(SIN[E]+0x5dc)>>1; F+=8 in order 15 (to 256), F-=8 in order 16 from row 0x30 (to 0). Loop exits at order 17.
// UNRESOLVED: entry (= exit of effect 3: order 15, i.e. at(15,0)), the start-up ticks NINIT and the frame pace TPF (ticks per loop pass: machine speed; here the harness's 3).
import {pos,at} from './timeline.js';
import {to8} from './common.js';
import {endState,NINIT as N3} from './swirl.js';
import {TE} from './fx03.js';
export const TICK_HZ=1193182/17045;
export const NINIT=1, TPF=3;   // harness-measured (tools/fx4check.mjs): 1 start-up tick; 270 of 294 passes take exactly 3 ticks (2: 13, 4: 11) = 23.4 fps; the pass length depends on the machine speed: UNRESOLVED
let SIN,P2,C,O,Cw,Ow,P1;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const f=await get('fx04','fx04.bin'); SIN=new Int32Array(f.slice(0,16384).buffer); P2=f.slice(16384,16384+48);
  C=(await get(14,'14.bin')).slice(); const r=await get(15,'15.bin'); P1=r.slice(10,10+768); O=r.slice(0x30a,0x30a+64000).map(v=>v<<4);
  Cw=new Uint32Array(C.buffer); Ow=new Uint32Array(O.buffer);
}
export const newS=()=>({a:1024,b:0,c:0,d:0,e:0,amp:1024,s817:3072,fade:0,n:0});
export function isrStep(S,order,row){
  if(order===15&&S.fade!==256)S.fade+=8;
  if(order===16&&row>=0x30&&S.fade!==0)S.fade-=8;
  S.s817=(S.s817+2)&0xfff; S.a=(S.a+9)&0xfff; S.b=(S.b-38)&0xfff; S.c=(S.c-26)&0xfff; S.d=(S.d+25)&0xfff; S.e=(S.e+3)&0xfff;
  S.amp=(SIN[S.e]+0x5dc)>>1; S.n++;
}
// the two offset tables (0x48f1a), step = [0x5f813], d0..d3 = [0x5f4d0..dc], b0 = [0x5f4b0] (static 0)
export function tables(S,H,V,step,d,b0=0){
  const h=(((b0&0xfff)-0x800)<<4);
  let eax=Math.imul(-158,step)+0xa00000+h, esi=(Math.imul(d[0],-160)+S.a)&0xfff, ebp=(Math.imul(d[1],-160)+S.b)&0xfff;
  for(let i=0;i<320;i++){let ebx=eax>>16; if(ebx>0x13f)ebx=0; if(ebx<0)ebx=0;
    ebx+=Math.imul(Math.imul(SIN[esi],S.amp)>>18,320)+(Math.imul(SIN[ebp],S.amp)>>18); H[i]=ebx; eax+=step; esi=(esi+d[0])&0xfff; ebp=(ebp+d[1])&0xfff}
  eax=Math.imul(-98,step)+0x640000+h; esi=(Math.imul(d[2],-100)+S.c)&0xfff; ebp=(Math.imul(d[3],-100)+S.d)&0xfff;
  for(let i=0;i<200;i++){let ebx=eax>>16; if(ebx>0xc7)ebx=0; if(ebx<0)ebx=0;
    ebx=Math.imul(ebx,320)+Math.imul(Math.imul(SIN[esi],S.amp)>>18,320)+(Math.imul(SIN[ebp],S.amp)>>18); V[i]=ebx; eax+=step; esi=(esi+d[2])&0xfff; ebp=(ebp+d[3])&0xfff}
}
const H=new Int32Array(320),V=new Int32Array(200),Dd=new Uint8Array(64000),Dw=new Uint32Array(Dd.buffer);
// one loop pass with ISR state S: updates T (Uint8Array 64000, Tw its dword view), writes VRAM (Uint8Array 64000)
export function frame(S,T,Tw,vram){
  const e=(SIN[S.a]+0x464)>>>2, step=0x10000-((SIN[S.s817]+0x400)<<6);
  tables(S,H,V,step,[e+0x23,e+0x19,e+0xf,e-5]);
  for(let y=0;y<200;y++)for(let x=0;x<320;x++){const o=V[y]+H[x];Dd[y*320+x]=o>=0&&o<64000?T[o]:0}
  const v=new Uint32Array(vram.buffer);
  for(let i=0;i<16000;i++){let a=(Math.imul(Dw[i],3)+Cw[i])>>>0;a=(a>>>2)&0x3f3f3f3f;Tw[i]=a;v[i]=(((a>>>2)&0x0f0f0f0f)|Ow[i])>>>0}
}
export function palette(S,pal){
  const F=S.fade;
  for(let o=0;o<16;o++)for(let i=0;i<16;i++)for(let c=0;c<3;c++){
    let a=((((P2[i*3+c]*F)>>8)*9+P1[o*3+c]*6)>>>3); if(a>0x3f)a=0x3f; pal[(o*16+i)*3+c]=to8((a*F)>>8)}
}
let ST,T,Tw,te,tx;
export const entry=()=>(tx??=(()=>{const x=endState(3,TE);return TE+x.n/TICK_HZ})());
const reset=()=>{ST={k:-1,S:newS(),vram:new Uint8Array(64000),pal:new Uint8Array(768)};T=C.slice();Tw=new Uint32Array(T.buffer)};
export function render(t,ctx){
  const t0=entry(), t1=at(17,0); if(t<t0||t>=t1)return false;
  const k=Math.floor(((t-t0)*TICK_HZ-NINIT)/TPF); if(!ST||k<ST.k)reset();
  while(ST.k<k){ST.k++;const n=NINIT+ST.k*TPF;const S=ST.S;
    while(S.n<n){const p=pos(t0+(S.n+1)/TICK_HZ);isrStep(S,p.order,p.row)}
    frame(S,T,Tw,ST.vram);if(ST.k===k)palette(S,ST.pal)}
  ctx.idx.set(ST.vram);ctx.pal.set(ST.pal);return true}
