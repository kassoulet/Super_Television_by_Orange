// fx4check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin FIELDS (`node tools/fx4check.mjs fields`); oracle: re/fx_oracle.py HOOKS=492b4:p,4931a:q,490de:s,493f4:r HOOK2=49417 FX=4
// STATE=60698:4,5f817:4,5f4c0:4,5f4c4:4,5f4c8:4,5f4cc:4,5f4a4:4,5f4a0:4,5f4b0:4,5f813:4,5f4d0:4,5f4d4:4,5f4d8:4,5f4dc:4 DUMPMEM=5f81f:300,5f4b0:4.
// (1) pixels: frame() (tables + lookup + feedback T + VRAM) fed with the oracle's own ISR variables at 0x4931a, replayed from the first frame (T is a recursion); a frame is compared only if no ISR tick fell
// inside the table build AND the 40 frames before were clean too (an ISR tick inside the build mixes two states, which the snapshots cannot describe; the error then decays by 3/4 per frame). (2) palette from the fade at 0x493f4, only for frames where the fade is the same at 0x4931a and 0x493f4 (the mix reads it per element). (3) ISR model: isrStep() against all snapshots.
import fs from 'fs'; import {init,frame,palette,isrStep,newS,tables} from '../web/fx/fx04.js';
const V=['60698','5f817','5f4c0','5f4c4','5f4c8','5f4cc','5f4a4','5f4a0','5f4b0','5f813','5f4d0','5f4d4','5f4d8','5f4dc'];
const F=['order','row',...['p','q','s','r'].map(t=>t+'_irqs'),...['p','q','s','r'].flatMap(t=>V.map(v=>t+'_'+v))];
if(process.argv[2]==='fields'){console.log(F.join(','));process.exit()}
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx04:rd('fx04.bin'),14:rd('14.bin'),15:rd('15.bin')});
const NF=F.length,R=NF*4+64000+768,d=fs.readFileSync(process.argv[2]),N=d.length/R,rec=[];
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));r.idx=d.subarray(i*R+NF*4,i*R+NF*4+64000);r.pal=d.subarray(i*R+NF*4+64000,(i+1)*R);rec.push(r)}
const St=(r,t)=>({a:r[t+'_5f4c0'],b:r[t+'_5f4c4'],c:r[t+'_5f4c8'],d:r[t+'_5f4cc'],e:r[t+'_5f4a4'],amp:r[t+'_5f4a0'],s817:r[t+'_5f817'],fade:r[t+'_60698'],n:0});
const T=new Uint8Array(rd('14.bin')),Tw=new Uint32Array(T.buffer),vram=new Uint8Array(64000);
let exact=0,bad=0,badpx=0,chk=0,clean=0,badpal=0,palok=0,eb=0;
for(let i=0;i<N;i++){const r=rec[i],S=St(r,'q');
  // derived values at 0x49459 loop top (e = (SIN[A]+0x464)>>2): compare with the oracle's [0x5f4d0] etc. through tables(): use frame() and check the d values separately
  frame(S,T,Tw,vram);
  if(r.q_irqs===r.s_irqs&&r.p_irqs===r.q_irqs)clean++;else clean=0;
  if(clean>=41){chk++;let n=0;for(let j=0;j<64000;j++)if(vram[j]!==r.idx[j])n++;if(n===0)exact++;if(n){bad++;badpx+=n;if(bad<4)console.log('pixel diff',n,'frame',i,'order',r.order,'row',r.row)}}
  if(r.q_60698===r.r_60698){const pal=new Uint8Array(768);palette(St(r,'r'),pal);palok++;for(let j=0;j<768;j++)if(pal[j]!==Math.floor(r.pal[j]*255/63))badpal++}
}
console.log('frames',N,'pixel frames compared',chk,'exact',exact,'bad frames',bad,'bad px',badpx,'| palette frames',palok,'bad bytes',badpal);
// (3) ISR model: ticks before the first sample from the counters, then follow the oracle's IRQ count (order/row of the sampled frame for every tick)
const cnt=(S,r,t)=>S.a===r[t+'_5f4c0']&&S.b===r[t+'_5f4c4']&&S.c===r[t+'_5f4c8']&&S.d===r[t+'_5f4cc']&&S.e===r[t+'_5f4a4']&&S.s817===r[t+'_5f817']&&(S.n===0||S.amp===r[t+'_5f4a0']);
let S=newS(),N0=-1;for(let n=0;n<5000&&N0<0;n++){if(cnt(S,rec[0],'p'))N0=n;isrStep(S,rec[0].order,rec[0].row)}
console.log('ticks before the first sample (harness start-up, NINIT)',N0);
S=newS();let n=0,bc=0,bf=0;const adv=(irq,r)=>{const tgt=irq-rec[0].p_irqs+N0;while(n<tgt){isrStep(S,r.order,r.row);n++}};
for(const r of rec)for(const t of ['p','q','s','r']){adv(r[t+'_irqs'],r);if(!cnt(S,r,t))bc++;if(S.fade!==r[t+'_60698'])bf++}
console.log('ISR model: wrong tick counters / amplitude in',bc,'and fade in',bf,'of',4*N,'snapshots');
let md=0;rec.forEach((r,k)=>{md=Math.max(md,Math.abs(r.p_irqs-rec[0].p_irqs-3*k))});console.log('frame pace: max tick deviation vs the port model (TPF=3 ticks per pass)',md);
