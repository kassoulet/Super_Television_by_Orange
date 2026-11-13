// effects 3 and 8, shared engine 0x485b0 (fx8 enters at 0x4856a, which sets other parameters and falls into it). Mode X 320x200, 3 pages.
// Per frame (one loop pass, one vsync wait): 40x25 source image (RLE chunk 13 / 23 -> 300 images of 1000 bytes at offset [0x5d290], 0x48d29), rendered by 0x48d63/0x48e0e: each
// of 39x24 cells = bilinear 8x8 block from its 4 corner bytes, written with plane masks 5 (rows 0-7) and 0xa (rows 3-10) as in the code (a virtual 4-plane VRAM reproduces the quincunx
// pattern literally), then the border clears; palette = 128 colours of 0x5d952 + 128 colours mixed (0x48695) from two of the 4 tables by the weights [0x5d272]/[0x5d276], both scaled by
// ([0x5d2c2]*[0x5d2a6]*[0x5f483]>>16)/256 (0x486d8..0x4871b). Per ISR tick (0x4890d, literal in isrStep) the variables advance.
import {pos} from './timeline.js';
import {VSYNC,to8} from './common.js';
export const TICK_HZ=1193182/17045;
export const EFF={3:{chunk:13,start:11,end:15,speed:3,x487:0},8:{chunk:23,start:23,end:26,speed:2,x487:1}};   // [0x5f43d],[0x5f443],[0x5f441],[0x5f445],[0x5f487] (static data / 0x4856a)
const TBL=[0x5ddd2,0x5e0d2,0x5e3d2,0x5e6d2], PTR=[[3,2],[2,1],[1,0],[0,1],[1,2],[2,3]];   // pointer pairs [0x5e9d2]/[0x5e9d6] by [0x5d26e] (index into TBL)
const R3=new Set([3,9,0x13,0x19,0x1d,0x23,0x29,0x33,0x39,0x3d]), R8=new Set([3,5,7,9,0xc,0x13,0x17,0x19,0x1c,0x23,0x25,0x27,0x29,0x2c,0x33,0x37,0x39,0x3c]);
let PA,PT; const DATA={}, PAE={};   // PAE[e] = the 128 static colours at 0x5d952 as the effect finds them
export function rle(d){const o=new Uint8Array(0x493e0);let i=0,n=0;while(n<0x493e0){const b=d[i++];if((b&0xc0)===0xc0){const c=b&0x3f,v=d[i++];o.fill(v,n,n+c);n+=c}else o[n++]=b}return o}
export async function init(assets){
  const get=async(n,u)=>new Uint8Array(assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer());
  const f=await get('fx03','fx03.bin'); PA=f.subarray(0,0x180); PT=f.subarray(0x180); PAE[3]=PA;
  PAE[8]=(await get(25,'25.bin')).subarray(10,10+0x180);   // fx8: left at 0x5d952 by fx7 = chunk 25 palette (checked equal to the oracle dump); fx3: static data
  for(const e of [3,8])DATA[e]=rle(await get(EFF[e].chunk,EFF[e].chunk+'.bin'));
}
export const newState=()=>({f2a6:256,f2c2:0,f483:256,f47f:0,off:0,c27a:0,w1:256,w2:0,idx:0,pp:[0,1],last:0});   // initial static data (re/mem.bin.gz); pp = pointer pair at load (0x5ddd2, 0x5e0d2)
// one ISR tick (0x4890d..0x48d27); ord/row = [0x44505]/[0x44504]
export function isrStep(S,e,ord,row){
  const P=EFF[e];
  if(ord===P.end-1&&row>=0x38)S.f47f=1;
  if(S.f47f===1&&S.f483!==0)S.f483-=4;
  if(P.x487===1||ord!==P.start){      // 0x489b4..0x48b6a
    if(P.x487!==1){if(R3.has(row))S.f2a6=0x1c0}
    else if(row!==S.last){S.last=row;if(R8.has(row))S.f2a6=0x1c0}
    if(S.f2a6!==0x100)S.f2a6-=8;
  }
  if(ord===15&&row>=0x2f){if(S.f2c2!==0)S.f2c2-=8}else if(S.f2c2!==0x100)S.f2c2+=8;
  if(P.x487===1||S.c27a===P.speed){if(P.x487!==1)S.c27a=0;S.off+=1000;if(S.off>=0x493e0)S.off-=0x493e0}   // 0x48bbe: [0x5f487]==1 -> advance every tick
  S.c27a++;
  if(S.w1!==0){S.w1-=4;S.w2+=4}else{S.w1=256;S.w2=0;S.idx++}
  if(S.idx===6)S.idx=0;
  S.pp=PTR[S.idx];
}
// ---- per-frame: palette and picture
export function palette(S,pal,e=3){const PA=PAE[e];
  const f=Math.imul(Math.imul(S.f2c2,S.f2a6),S.f483)>>>16, A=S.pp[0]*0x300, B=S.pp[1]*0x300;
  const sc=x=>{const v=(x*f)>>8;return to8(v>63?63:v)};
  for(let i=0;i<0x180;i++){pal[i]=sc(PA[i]);pal[0x180+i]=sc(((PT[A+i]*S.w1+PT[B+i]*S.w2)>>8)&255)}
}
const L=new Uint8Array(8);
function wr(V,mask,a,v){for(let p=0;p<4;p++)if(mask>>p&1)V[p*65536+a]=v}
function cell(V,ed,a,b,c,d){
  const ea=(c-a)<<6,ep=(d-b)<<6; let ebx=(a<<8)+0x8000,edx=(b<<8)+0x8000;
  for(let i=0;i<4;i++){L[2*i]=(ebx>>8)&255;L[2*i+1]=(edx>>8)&255;ebx+=ea;edx+=ep}
  for(let pass=0;pass<2;pass++){
    let o=ed+(pass?0xf0:0);
    for(let i=0;i<4;i++){
      const l=L[2*i],dd=L[2*i+1]-l; let t=l<<8,cl,ch;
      if(!pass){cl=l;ch=(t+(dd<<7))>>8&255}else{t+=dd<<6;cl=t>>8&255;t+=dd<<7;ch=t>>8&255}
      const m=pass?0xa:5; wr(V,m,o,cl);wr(V,m,o+1,ch);wr(V,m,o+0x51,cl);wr(V,m,o+0x52,ch); o+=0xa0;
    }
  }
}
const z4=(V,a)=>{for(let p=0;p<4;p++)V.fill(0,p*65536+a,p*65536+a+4)};
// renders the picture into the 4-plane VRAM V (4x65536) at page byte offset pg (0x48d63)
export function draw(V,e,S,pg){
  const D=DATA[e]; let ed=pg+0x141;
  for(let r=0;r<24;r++){for(let c=0;c<39;c++){const i=S.off+r*40+c;cell(V,ed,D[i],D[i+1],D[i+40],D[i+41]);ed+=2}ed+=0x232}
  for(let a=0;a<640;a+=4)z4(V,pg+a);
  for(let a=0;a<320;a+=4)z4(V,pg+640+0x3ac0+a);
  for(let r=0;r<200;r++)z4(V,pg+0x4e+0x50*r);
}
export function show(V,pg,idx){for(let y=0;y<200;y++)for(let x=0;x<320;x++)idx[y*320+x]=V[(x&3)*65536+pg+y*80+(x>>2)]}
// ---- timing. n = ISR ticks since the entry (ISR installed before the call): NINIT during the start-up (RLE decode, 0x4845a, ...) then one vsync per frame (frame k = loop pass k)
export const NINIT={3:8,8:0};   // 3: measured in the harness (swirlcheck.mjs, counters), machine dependent; 8: see NOTES
const PAGES=[0,42666,21333];       // page of loop pass 0,1,2,... (rotation 0x4874e from [0x5d2b2..ba] = 0, 21333, 42666)
export function stateAt(e,te,n,S0){
  const S=S0?{...S0}:newState(); if(NINIT[e]===0)Object.assign(S,{f2c2:0,f2a6:256,off:0});
  for(let j=1;j<=n;j++){const p=pos(te+j/TICK_HZ);isrStep(S,e,p.order,p.row);if(j===NINIT[e])Object.assign(S,{f2c2:0,f2a6:256,off:0})}
  return S}
const nAt=(e,k)=>NINIT[e]+Math.floor(k/VSYNC*TICK_HZ);
// loop exit (0x487a6): fade [0x5f483]==0 or order==[0x5f441]; returns {S,n,k} of the last pass, S = state the next effect inherits (variables are not reset by 0x4856a)
export function endState(e,te,S0){
  for(let k=0;;k++){const n=nAt(e,k),S=stateAt(e,te,n,S0),p=pos(te+n/TICK_HZ);if(S.f483===0||p.order===EFF[e].end)return{S,n,k}}}
export function render(e,te,S0,t,ctx){
  const k=Math.floor((t-te-NINIT[e]/TICK_HZ)*VSYNC); ctx.idx.fill(0); if(k<0){ctx.pal.fill(0);return true}
  const S=stateAt(e,te,nAt(e,k),S0),V=new Uint8Array(4*65536),pg=PAGES[k%3];
  draw(V,e,S,pg);show(V,pg,ctx.idx);palette(S,ctx.pal,e);return true}
