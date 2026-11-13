// effect 1 (0x4705f), mode X 320x200, 3 video pages. Per ISR tick (hook 0x473ef, PIT 70.0027 Hz, counters start at the effect entry) the state S advances
// (isrStep, literal). Per frame (one vsync wait each; two frames per loop: variant A 0x46da9, variant B 0x46e78): tables T1/T2 (0x46bf2) from S, then the 4 plane calls
// of 0x46d53: for a pixel of the 256x200 left part whose background mask byte (chunk 4) is 0: out = TBL[(map + S.x + T1[map>>8] + T2[map&255]) & 0xffff], map = chunk 9 word, TBL = chunk 8 (+0x80808080 dword adds).
// Variant A writes the pixels with x+y odd, B those with x+y even; the page written changes every frame (0, 0x7d00, 0x3e80) so the displayed page n = bg + half of frame n-3 (other variant) + half of frame n.
// UNRESOLVED (not derivable from the code): the entry time (= exit of effect 0, machine dependent) and the frame pace (the loop waits one vsync per frame; the port assumes the drawing fits in one vsync). Entry = exit of effect 0, derived: from order 8 its ISR drives [0x4dfc8] (start -640, += [0x4dbe0] starting 1024, that decreases by 8 per tick) to 0xff80 after 115 ticks ([0x4dbec] ramps up during orders 0-7 to 0x400, then needs 64 ticks to reach 0); the port uses at(8,0)+115 ticks. Sub-tick PIT phase and fx0's main-loop latency are UNRESOLVED.
import {pos,at} from './timeline.js';
import {VSYNC,to8} from './common.js';
export const TICK_HZ=1193182/17045;
let SIN,P0,P1,MASK,MAP,TBL;
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const f=await get('fx01','fx01.bin'); SIN=new Int32Array(f.slice(0,2048).buffer); P0=f.subarray(2048,2048+384); P1=f.subarray(2048+384,2048+768);
  MASK=await get(4,'04.bin'); const m=await get(9,'09.bin'); MAP=new Uint16Array(m.slice().buffer);
  const t=(await get(8,'08.bin')).slice(), dv=new DataView(t.buffer); for(let i=0;i<65536;i+=4)dv.setUint32(i,(dv.getUint32(i,true)+0x80808080)>>>0,true); TBL=t;
}
export const newState=()=>({f4:0,f8:256,ca:256,c1:0,c2:0,c3:0,a:0,b:0,c:0,d:0,m1:0,m2:0,m3:0,m4:0,x:0});
export function isrStep(S,order,row){
  if(order===10&&row>=0x2f){if(S.f4>0){S.f4-=6;S.f8-=6;if(S.f4<=0)S.f4=S.f8=0}else S.f4=S.f8=0}
  else if(S.f4!==256)S.f4+=2;
  if(order!==8&&row<=8&&S.ca!==256)S.ca+=16;
  if(row>=0x38&&S.ca!==0)S.ca-=8;
  if(order===8)[S.m1,S.m2,S.m3,S.m4]=[0,0x80,0x20,0]; if(order===9)[S.m1,S.m2,S.m3,S.m4]=[0x20,0x40,0x30,0]; if(order===10)[S.m1,S.m2,S.m3,S.m4]=[0,0x40,0,0x10];
  S.c1=(S.c1+3)&0x7ff; S.c2=(S.c2+5)&0x7ff; S.c3=(S.c3+7)&0x7ff;
  S.x=((SIN[S.c1>>2]+SIN[S.c2>>2]+SIN[S.c3>>2])>>3)&0xffff;
  S.a=(S.a-0x20)&0xfff; S.b=(S.b-0x38)&0xfff; S.c=(S.c-0x28)&0xfff; S.d=(S.d-0x40)&0xfff;
}
// state after n ticks from the entry te (order/row at the tick time from the music timeline)
export function stateAt(te,n){const S=newState();for(let j=1;j<=n;j++){const p=pos(te+j/TICK_HZ);isrStep(S,p.order,p.row)}return S}
const tab=(a,b,da,db)=>{const T=new Uint16Array(256);for(let i=0;i<256;i++){T[i]=((((SIN[b>>3]+256)>>4)<<8)+((SIN[a>>3]+256)>>4))&0xffff;a=(a+da)&0xfff;b=(b+db)&0xfff}return T};
const CALLS=[[[3,0,6,3],[2,80,0x204,0x142],[1,0,2,1],[0,80,0x200,0x140]],[[3,80,0x206,0x143],[2,0,4,2],[1,80,0x202,0x141],[0,0,0,0]]];
// background: all three pages hold chunk 4; plane p byte i = chunk4[p+4i]  =>  pixel (x,y) = chunk4[y*320+x]
export function bg(idx){idx.set(MASK.subarray(0,64000))}
// writes the pixels of variant v (0=A,1=B) for the table state St (0x46bf2) and the draw state Sd (0x5c9ff) into idx (64000)
export function half(idx,v,St,Sd){
  const T1=tab(St.a,St.b,St.m1,St.m2),T2=tab(St.c,St.d,St.m3,St.m4);
  for(const [p,eo,so,mo] of CALLS[v])for(let r=0;r<100;r++)for(let xi=0;xi<64;xi++){
    if(MASK[mo+r*640+xi*4])continue;
    const w=MAP[(so+r*1024+xi*8)>>1], ax=(w+Sd.x+T1[w>>8]+T2[w&255])&0xffff;
    idx[(2*r+(eo?1:0))*320+4*xi+p]=TBL[ax]}
}
export function palette(S,ctx){for(let i=0;i<384;i++){ctx.pal[i]=to8((P0[i]*S.f8)>>8);ctx.pal[384+i]=to8(((P1[i]*S.f4*S.ca)>>>16)&0xff)}}
export function render(t,ctx){
  const te=at(8,0)+115/TICK_HZ, k=Math.floor((t-te)*VSYNC); if(k<0)return false;
  const N=n=>Math.floor(n/VSYNC*TICK_HZ), Sk=stateAt(te,N(k));
  bg(ctx.idx); if(k>=3){const S3=stateAt(te,N(k-3));half(ctx.idx,(k-3)&1,S3,S3)} half(ctx.idx,k&1,Sk,Sk); palette(Sk,ctx); return true}
