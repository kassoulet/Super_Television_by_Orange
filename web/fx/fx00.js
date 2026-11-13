// effect 0 (0x45a30), Mode X 320x200, 3 pages (0, 0x5355, 0xa6aa), loop = one vsync per pass.
// Per pass (0x45c06..0x45e24): palette (cross-fade of 4 chunk-less palette sets x fades), render 0x4507a, flip, palette out.
// Render: 0x46603 = 40x25 grid of 8x8 cells blended noise/animation (chunk 16, RLE 0x493e0 bytes = 300 pictures 40x25) drawn as bilinear patches (0x4679a) on planes 0/2 then 1/3 (spills included),
//   then rows 0..7 / 196..199 / 2 columns cleared; then by order: 0 nothing, 1-3 and >=8 separable warp (X[320],Y[200] clamped tables, texture = [0x4f660], 0 transparent: 0x452ee x4 planes),
//   4 (row 0x3f) and 5-7 a 320x100 picture (chunk 3 RLE, index from tables 0x550e9..) copied to rows 50..149 (0x459e6, 0 transparent).
// ISR 0x45f1e (70 Hz) ported 1:1 in isrStep (replayed from the entry like the other effects); NOTHING here is a guess, but the entry tick count / pace are harness measurements, see NINIT/TPF.
import {pos,at} from './timeline.js';
import {to8} from './common.js';
export const TICK_HZ=1193182/17045;
export const NINIT=15;   // ISR ticks before the loop entry 0x45bfc (no-ops in the ISR: [0x550e5]==0): harness measurement (decode + init at 2e7 instr/s), machine dependent: UNRESOLVED
export const VSYNC=25175000/(800*449);   // loop = one pass per vertical retrace (0x45dd1..0x45ddd polls 0x3da bit 3): VGA 25.175 MHz dot clock, 800x449 total = 70.0866 Hz (assumes a pass fits in a frame on the original machine: UNRESOLVED)
let SIN,T68,SEQ,PALS,B90,MEM,PIC16,ORGA,ORGB;
const OA=0xf2300+64000, OB=OA+64000;     // MEM: pictures 0.., final picture 0xf2300, texture buffers A (chunk 0) and B (chunk 1)
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const f=await get('fx00','fx00.bin'); const dv=new DataView(f.buffer,f.byteOffset);
  SIN=new Int32Array(4096); for(let i=0;i<4096;i++)SIN[i]=dv.getInt32(4*i,true);
  T68=new Int32Array(2049); for(let i=0;i<2049;i++)T68[i]=dv.getInt32(16384+4*i,true);
  let o=16384+2049*4; SEQ=[0,1,2].map(k=>new Int32Array(64).map((_,i)=>dv.getInt32(o+256*k+4*i,true))); o+=768;
  PALS=[0,1,2,3,4,5,6].map(k=>f.slice(o+0x180*k,o+0x180*(k+1))); o+=7*0x180; B90=f.slice(o,o+4);
  MEM=new Uint8Array(OB+64000);
  const c3=await get(3,'03.bin'); let i=0,q=0;       // 0x46585: 31 pictures, RLE (0xc0|n, value), 0x80 header before and 0x301 after each; the 31st reads zeros past the chunk (index <=29 only is ever used)
  for(let k=0;k<31;k++){i+=0x80;let n=0;while(n!==0x7d00){const b=i<c3.length?c3[i]:0;i++;if((b&0xc0)===0xc0){const c=b&0x3f,v=i<c3.length?c3[i]:0;i++;MEM.fill(v,q,q+c);q+=c;n+=c}else{MEM[q++]=b;n++}}i+=0x301}
  MEM.set((await get(4,'04.bin')).subarray(0,64000),0xf2300); MEM.set((await get(0,'00.bin')).subarray(0,64000),OA); MEM.set((await get(1,'01.bin')).subarray(0,64000),OB);
  ORGA=MEM.slice(OA,OA+64000);ORGB=MEM.slice(OB,OB+64000);
  const c16=await get(16,'16.bin'); PIC16=new Uint8Array(0x493e0); i=0;q=0;   // 0x465c9
  while(q<0x493e0){const b=c16[i++];if((b&0xc0)===0xc0){const c=b&0x3f,v=c16[i++];PIC16.fill(v,q,q+c);q+=c}else PIC16[q++]=b}
}
// ISR/main-loop variables, named by the low digits of their address (0x4db64 -> b64, 0x4dc04 -> c04, 0x4dfc8 -> fc8, 0x550d7 -> n550d7, 0x4f660 -> f660)
export function newS(){
  const S={b5c:0x5bab,b64:0x800,b68:0,b6c:0x100,b70:0xc00,b74:0,b78:0,b7c:0,b80:0,b84:0,b94:0,b9c:0,ba0:0,ba4:0,ba8:0,bb0:0,bb4:0x100,bb8:0,bbc:0,bd2:0,be0:0,be8:0x100,bec:1,bf0:0,
    bf4:0,bf8:0x5355,bfc:0xa6aa,c04:0x100,c08:0,c40:0x100,cb8:0xc00,cbc:-0x780000,cc0:-0x50000,fc8:0,fd0:0,sA:0,sB:1,f660:OA,f664:OB,n550b3:0,n550d7:0,n550db:0,n550e5:1,n554e9:0,n:0,bdc:0};
  S.fc8=0xff80; do{S.fc8-=S.be0;S.be0+=8}while(S.fc8>=0);   // 0x45baf..0x45bd2
  S.bdc=S.fc8; S.fd0=S.be0; return S;
}
const SETA=[3,2,1,0,1,2], SETB=[2,1,0,1,2,3];
export function isrStep(S,o,r){
  const l46349=()=>{S.fc8=0xff80;l46353()};
  const l46353=()=>{if(S.bec>0){S.bec-=0x10;l463a6()}else l4636c()};
  const l4636c=()=>{if(S.bec<=0)S.bec=0;if(S.bec!==0&&S.bec!==0x400)S.bec++;l463a6()};
  const l463a6=()=>{
    if(o>4){if(o<8){S.cbc=0;S.fc8=0xff80}S.cc0=0;S.bf0=0}
    else{
      if(o===1){
        if(S.fc8<0x8000){S.fc8+=S.fd0>>1;if(S.fd0===0)return l46349();S.fd0-=8}
        S.cb8=(S.cb8+8)&0xfff}
      if(o>1&&o<3){
        if(S.fc8<0x10000){
          let eax=0x8000,ebx=0x10000,edx=T68[S.b74]+0x400;
          eax=Math.imul(eax,edx); S.c40=Math.imul(0x100,edx)>>11;
          edx=-T68[S.b74]+0x400; ebx=Math.imul(ebx,edx); S.fc8=(eax+ebx|0)>>11;
          if(S.b74!==0x800)S.b74+=8}
        S.cb8=(S.cb8+8)&0xfff}
      if(o<5&&o>=3){
        if(S.n554e9!==1){S.fd0=0;S.n554e9=1}
        S.fd0++;S.fc8-=S.fd0>>1;S.ba8+=0x60}}
    if(o===3&&r>=0x1f){S.b7c+=0x10;S.b80+=S.b7c;S.b78+=S.b80}
  };
  if(o===1)S.n550b3=1;
  if(o===3){
    if(S.n550d7>(S.n550db&0x3f)){S.n550db=(S.n550db+0x9d)|0;S.n550db=(S.n550db<<11|S.n550db>>>21);S.n550db^=0x9d;S.n550d7=0;const t=S.f660;S.f660=S.f664;S.f664=t}
    if(S.c08!==1){S.b9c=0x400;S.c08=1}}
  S.n550d7++;
  if(S.n550e5!==1){S.n++;return}
  if(S.b64!==0){S.b64--;S.b68++}
  if(o===3)S.ba0=(S.ba0+0x66)&0xfff;
  if(o===4){S.b70=(S.b70+0x66)&0xfff;if(S.b6c!==0)S.b6c--}
  S.b94=(S.b94+0x1d0)&0xfff;
  if(S.b9c!==0)S.b9c-=8;
  if(S.bb4!==0){S.bb4-=4;S.bb8+=4}else{S.bb4=0x100;S.bb8=0;S.bb0++}
  if(S.bb0===6)S.bb0=0;
  S.sA=SETA[S.bb0];S.sB=SETB[S.bb0];
  let b88=S.f660;
  if(o===4&&r===0x3f)b88=0;
  if(o>=5&&o<=7)b88=SEQ[o-5][r&63]*0x7d00;
  S.f660=b88;
  if(o>=8)S.f660=0xf2300;
  if(S.bbc===2){S.bbc=0;S.bd2+=0x3e8;if(S.bd2>=0x493e0)S.bd2-=0x493e0}
  S.bbc++;
  if(S.c04>0x100)S.c04-=0x10;
  if(r===0x3f)for(let i=0;i<4;i++)if((o&255)===B90[i]){S.c04=0x400;break}
  if(o>=8){
    if(S.bec===0x400)S.fc8=S.bdc;
    if(S.fc8<0xff80){S.fc8+=S.be0;if(S.be0===0)S.fc8=0xff80;else S.be0-=8}else S.fc8=0xff80;
    l46353()}
  else l4636c();
  S.n++;
}
// ---- planar VRAM (Mode X): P[p] = plane p, 64K
export const newV=()=>[0,1,2,3].map(()=>new Uint8Array(65536));
function cell(P,e,c0,c1,c2,c3){   // 0x4679a
  let eax=(c2-c0)<<6,ebx=c0<<8,ebp=(c3-c1)<<6,edx=c1<<8; ebx+=0x8000;edx+=0x8000;
  const L=[],R=[];
  for(let i=0;i<4;i++){L.push(ebx&0xffff);R.push(edx&0xffff);ebx+=eax;edx+=ebp}
  for(let i=0;i<4;i++){
    const ax=(((R[i]-L[i])<<16)>>16)>>1; let bx=L[i]; const cl=bx>>8; bx=(bx+ax)&0xffff; const ch=bx>>8, a=e+i*0xa0;
    for(const p of [0,2]){const V=P[p];V[a]=cl;V[a+1]=ch;V[a+0x51]=cl;V[a+0x52]=ch}}
  e+=0xf0;
  for(let i=0;i<4;i++){
    let ax=(((R[i]-L[i])<<16)>>16)>>2; let bx=L[i]; bx=(bx+ax)&0xffff; ax=(ax<<1)&0xffff; const cl=bx>>8; bx=(bx+ax)&0xffff; const ch=bx>>8, a=e+i*0xa0;
    for(const p of [1,3]){const V=P[p];V[a]=cl;V[a+1]=ch;V[a+0x51]=cl;V[a+0x52]=ch}}
}
export const newNoise=()=>new Uint8Array(1000);
function noise(S,N,P,pg){   // 0x46603
  if(S.b64!==0){
    let eax=S.b5c;
    for(let i=0;i<1000;i++){N[i]=((eax&0x3f)+N[i]*3)>>2;eax=(eax+0x9d)|0;eax=(eax<<11)|(eax>>>21);eax^=0x9d}
    S.b5c=eax}
  let s=S.bd2,e=pg+0x141,k=0;
  const m=(i)=>{const v=(Math.imul(PIC16[s+i],S.b68)+Math.imul(N[k+i],S.b64))>>11;return v>0x3f?0x3f:v};
  for(let y=0;y<24;y++){
    for(let x=0;x<39;x++){cell(P,e,m(0),m(1),m(0x28),m(0x29));e+=2;s++;k++}
    e+=0x232;s++;k++}
  for(let p=0;p<4;p++){const V=P[p];
    V.fill(0,pg,pg+640);V.fill(0,pg+640+0x3ac0,pg+640+0x3ac0+320);
    for(let r=0;r<200;r++){const a=pg+r*80+0x4e;V[a]=V[a+1]=0;V[a+2]=V[a+3]=0}}
}
const X=new Int32Array(320),Y=new Int32Array(200);
function warp(S,P,pg){          // 0x45136..0x452aa
  const p=(S.fc8+S.ba4)|0, q=(p+S.bf0)|0;
  let eax=(Math.imul(-160,p+0x80)+0xa00000+S.cbc+0x10000)|0;
  for(let i=0;i<320;i++){let b=eax>>16;if(b>0x13f)b=0x13f;if(b<0)b=0;X[i]=b;eax=(eax+p)|0}
  eax=(Math.imul(-100,q+0x80)+0x640000+S.cc0+0x10000)|0;
  for(let i=0;i<200;i++){let b=eax>>16;if(b>0xc7)b=0xc7;if(b<0)b=0;Y[i]=Math.imul(b,320)+S.f660;eax=(eax+q)|0}
  for(let pl=0;pl<4;pl++){const V=P[pl];
    for(let r=0;r<200;r++){const yo=Y[r],o=pg+r*80;
      for(let k=0;k<80;k++){const a=MEM[X[4*k+pl]+yo];if(a!==0)V[o+k]=a}}}
}
function pic(S,P,pg){           // 0x452ab / 0x459e6
  for(let pl=0;pl<4;pl++){const V=P[pl];let b=S.f660+pl,e=pg+0xfa0;
    for(let i=0;i<8000;i++){const a=MEM[b];if(a!==0)V[e]=a;e++;b+=4}}
}
function scale(src,so,dst,dop,n,edx){for(let i=0;i<n;i++){let v=(src[so+i]*edx)>>8;dst[dop+i]=v>0x3f?0x3f:v}}
// one loop pass (0x45c06..0x45e24) at ISR state S and music (o,r): draws into planes P (page S.bf4), fills pal6 (768, 6-bit), flips pages
export function pass(S,N,P,o,r,pal6){
  const tmp=new Uint8Array(0x180);
  const A=PALS[3+S.sA],B=PALS[3+S.sB];
  for(let i=0;i<0x180;i++)tmp[i]=(A[i]*S.bb4+B[i]*S.bb8)>>8;
  let src=PALS[2]; if(o>=8)src=PALS[1]; if((o===4&&r===0x3f)||(o>=5&&o<=7))src=PALS[0];
  scale(src,0,pal6,0,0x180,(S.c04*S.be8)>>>8);
  let ebx=0x800-((SIN[S.b70]+0x400)*S.b6c>>8);
  let edx=Math.imul(S.c04,ebx)>>11; edx=Math.imul(edx,S.be8)>>>8; edx=Math.imul(edx,S.bec)>>>10;
  scale(tmp,0,pal6,0x180,0x180,edx);
  if(o<=4)S.cbc=(Math.imul(SIN[S.cb8],S.c40)<<5)+S.b78|0;
  if(S.b78>=0x1400000){S.b78=0;MEM.fill(0,OA,OA+64000);MEM.fill(0,OB,OB+64000)}
  // render 0x4507a
  const pg=S.bf4;
  S.ba4=Math.imul(SIN[S.ba0],S.b9c)>>6;
  noise(S,N,P,pg);
  if(S.n550b3!==0){
    if(o===8||o>8){if(S.b84!==1){S.b84=1;S.fc8=1}S.f660=0xf2300;warp(S,P,pg)}
    else if(o===0){}
    else if(o===4){if(r===0x3f)pic(S,P,pg)}
    else if(o<5){warp(S,P,pg)}
    else pic(S,P,pg);
    if(o===8||o>8){}
  }
  if(o>=5&&o<8){const e=(SIN[S.b94]>>4)+0x100;for(let i=0;i<0x180;i++){const v=(pal6[i]*e)>>>8;pal6[i]=v>0x3f?0x3f:v}}
  const t=S.bf4;S.bf4=S.bfc;S.bfc=S.bf8;S.bf8=t;   // 0x45df5: xchg chain
  return t;
}
export function display(P,pg,idx){for(let y=0;y<200;y++)for(let x=0;x<320;x++)idx[y*320+x]=P[x&3][pg+y*80+(x>>2)]}
export const palette=(pal6,pal)=>{for(let i=0;i<768;i++)pal[i]=to8(pal6[i])};

export const MEMdump=(y,a=(y-50)*320+48,b=(y-50)*320+132)=>MEM.slice(a,b);
export const cbcBase=S=>Math.imul(SIN[S.cb8],S.c40)<<5;   // check helper: the oracle p snapshot is taken after the b78 reset (0x45d47), so b78 before it = cbc - cbcBase
export const doneK=()=>ST&&ST.done;
export const reset=()=>{MEM.set(ORGA,OA);MEM.set(ORGB,OB)};   // texture buffers A/B are cleared by the b78 wrap (0x45d47): restore them before replaying

// ---- player contract. Entry = music start (effect 0 is the first routine). Pass k starts at NINIT/TICK_HZ + k/VSYNC; ISR ticks are replayed from the entry with the music position at each tick.
// STATEFUL (noise buffer N + LFSR b5c, while b64!=0, ~29 s; texture buffers A/B cleared at the b78 wrap; the 3 pages are fully rewritten each pass): render(t) replays from pass 0, with a checkpoint every 64 passes.
// The loop ends after the pass where [0x4dbec]==0 && [0x4dfc8]==0xff80 (0x45e2a..0x45e41): later t shows that last pass.
const CKN=64;
let ST=null, CK=[];
const snap=ST=>({k:ST.k,S:{...ST.S},P:ST.P.map(a=>a.slice()),N:ST.N.slice(),A:MEM.slice(OA,OA+64000),B:MEM.slice(OB,OB+64000),idx:ST.idx.slice(),pal6:ST.pal6.slice(),done:ST.done});
const restore=c=>{MEM.set(c.A,OA);MEM.set(c.B,OB);return{k:c.k,S:{...c.S},P:c.P.map(a=>a.slice()),N:c.N.slice(),idx:c.idx.slice(),pal6:c.pal6.slice(),done:c.done}};
function fresh(){reset();return{k:-1,S:newS(),P:newV(),N:newNoise(),idx:new Uint8Array(64000),pal6:new Uint8Array(768),done:-1,pos:null}}
function runPass(ST){
  const k=++ST.k, tk=NINIT/TICK_HZ+k/VSYNC, S=ST.S, n=Math.floor(tk*TICK_HZ);
  if(S.n<NINIT)S.n=NINIT;
  while(S.n<n){const p=pos((S.n+1)/TICK_HZ);isrStep(S,p.order,p.row)}
  const p=pos(tk), pg=pass(S,ST.N,ST.P,p.order,p.row,ST.pal6);display(ST.P,pg,ST.idx);
  if(S.bec===0&&S.fc8===0xff80)ST.done=k;
}
export function render(t,ctx){
  let k=Math.max(0,Math.floor((t-NINIT/TICK_HZ)*VSYNC));
  if(ST&&ST.done>=0)k=Math.min(k,ST.done);
  let c=null;for(let i=Math.min(CK.length-1,Math.floor(k/CKN));i>=0;i--)if(CK[i]&&CK[i].k<=k){c=CK[i];break}
  if(!ST||k<ST.k||(c&&c.k>ST.k))ST=c?restore(c):fresh();
  while(ST.k<k&&ST.done<0){runPass(ST);if(ST.k%CKN===CKN-1&&!CK[(ST.k+1)/CKN-1])CK[(ST.k+1)/CKN-1]=snap(ST)}
  ctx.idx.set(ST.idx);palette(ST.pal6,ctx.pal);return true;
}
