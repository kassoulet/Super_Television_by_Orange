// effect 9 (0x4a186) "TV static": 320x360 of 160x120 RGB-triplet pixels (3 scanlines = 3 palette banks R/G/B, doubled horizontally), 320x400 mode, ctx.h=400.
// Per frame (49fce): a 3-state LCG fills 19200 random bytes; each byte picks one of 5 offsets {0,+-3,+-480} into the 57600-byte source image
// (160x120x3; chunk 18 >>2); dst[i]=src[i+off] (the image diffuses, buffers swap each frame) and the VRAM value (in place, single page) becomes
// B[old - 0x40*line] + A[img] + 0x40*line (A = floor(j/8), B = ~0.9*k ramp, both static tables).
// STATEFUL: frame k depends on frame k-1 (image + VRAM + LCG); render(t) replays from frame 0 (cached, forward continues). Cheap: ~1 ms/frame.
// UNRESOLVED: the frame rate. The loop (0x4a186) does one vsync wait per frame then ends at 350 frames or order 31, whichever first; its real speed is machine dependent and not in the code (<=70 fps).
// FPS=13 is NOT derived: it only makes 350 frames span about orders 26.5-31 (= the fade at order 30 row 48 being reached).
import {pos,at} from './timeline.js';
import {to8} from './common.js';
export const FPS=13, FRAMES=350, ENTER=[26,32];   // effect 9 starts at order 26 row 32 (golden log); the original leaves at order 31 or after 350 frames
let A,B,OFF,PAL,SEED,IMG0;
const PAD=1024, W=160, H=120, N=57600;
let S;   // {k, a, b (padded images), vram (160*360), lcg}
export async function init(assets){
  const get=async(n,u)=>assets?assets[n]:await (await fetch('assets/'+u)).arrayBuffer();
  const d=new Uint8Array(await get('fx09','fx09.bin')); const dv=new DataView(d.buffer,d.byteOffset);
  A=d.subarray(0,256); B=d.subarray(256,512); OFF=Int32Array.from({length:256},(_,i)=>dv.getInt32(512+4*i,true)); PAL=d.subarray(1536,2304);
  SEED=[dv.getUint32(2304,true),dv.getUint32(2308,true),dv.getUint32(2312,true)];
  IMG0=new Uint8Array(await get(18,'18.bin')).subarray(0,N);
}
function reset(){
  const a=new Uint8Array(N+2*PAD), b=new Uint8Array(N+2*PAD);
  for(let i=0;i<N;i++)a[PAD+i]=IMG0[i]>>2;
  const vram=new Uint8Array(W*360); for(let y=0;y<360;y++)vram.fill((y%3)*0x40,y*W,y*W+W);
  S={k:0,a,b,vram,lcg:SEED.slice(),rnd:new Uint8Array(19200)};
}
const rol=(v,n)=>(v<<n)|(v>>>(32-n));
function step(){
  const {a,b,vram,rnd}=S; let [x,y,z]=S.lcg; const R=new Uint32Array(rnd.buffer);
  for(let i=0;i<4800;i++){R[i]=x; x=(x+y)|0; y=(y+z)|0; z=rol(z,2); y=rol(y,1); x^=z; z^=x}
  S.lcg=[(S.lcg[0]+x)>>>0,(S.lcg[1]+y)>>>0,(S.lcg[2]+z)>>>0];
  for(let g=0;g<H;g++)for(let c=0;c<W;c++){
    const i=g*W+c, p=i*3, o=PAD+p+(S.k?OFF[rnd[i]]:0);   // the offset table is copied in at the END of each frame: frame 0 runs with zeros
   
    for(let l=0;l<3;l++){const v=a[o+l], j=(g*3+l)*W+c; b[PAD+p+l]=v; vram[j]=((B[vram[j]-0x40*l&255]+A[v])&255)+0x40*l}
  }
  S.a=b; S.b=a; S.k++;
}
export function render(t,ctx){
  const t0=at(...ENTER), t1=at(31,0); if(t<t0||t>=t1)return false;
  const k=ctx.frame!==undefined?ctx.frame:Math.min(FRAMES,Math.floor((t-t0)*FPS));
  if(!S||k<S.k)reset(); while(S.k<k)step();
  ctx.h=400; const idx=ctx.idx; idx.fill(0,0,128000);
  for(let y=0;y<360;y++){const r=y*W, o=y*320; for(let x=0;x<320;x++)idx[o+x]=S.vram[r+(x>>1)]}
  const q=pos(t); let fade=256; if(q.order===30&&q.row>=0x30)fade=256-(q.row-0x30)*16;
  for(let i=0;i<768;i++)ctx.pal[i]=to8((PAL[i]*fade>>8)&255);
  return true}
