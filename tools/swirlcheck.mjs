// swirlcheck.mjs E STATES.bin  (E = 3 or 8). STATES.bin = tools/oracle2bin.py X.npy S.bin FIELDS with FIELDS = the list printed by `node tools/swirlcheck.mjs fields`;
// oracle: re/fx_oracle.py HOOKS=48695:p,486c9:q,48720:d HOOK2=48774 FX=E STATE=5d290:4,5d2a6:4,5d2c2:4,5f483:4,5d272:4,5d276:4,5d26e:4,5d27a:4,5d2b2:4,5f47f:4,5e9d2:4,5e9d6:4,5f48f:1 (see re/NOTES.md).
// (1) pixels: swirl.js draw() fed with the oracle's own source offset/page of the frame, fresh VRAM (also proves the picture does not depend on the previous pages): expects 0 bad.
// (2) palette: palette() fed with the oracle's variables, only for frames where no ISR tick fell between 0x48695 and 0x48720. (3) ISR model: isrStep() tick by tick (ticks = oracle IRQ count) against all snapshots.
import fs from 'fs'; import {init,draw,show,palette,isrStep,newState,stateAt,NINIT,EFF} from '../web/fx/swirl.js';
const V=['5d290','5d2a6','5d2c2','5f483','5d272','5d276','5d26e','5d27a','5d2b2','5f47f','5e9d2','5e9d6','5f48f'];
const F=['order','row','p_irqs','q_irqs','d_irqs',...['p','q','d'].flatMap(t=>V.map(v=>t+'_'+v))];
if(process.argv[2]==='fields'){console.log(F.join(','));process.exit()}
const e=+process.argv[2], A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx03:rd('fx03.bin'),13:rd('13.bin'),23:rd('23.bin'),25:rd('25.bin')});
const NF=F.length,R=NF*4+64000+768,d=fs.readFileSync(process.argv[3]),N=d.length/R,rec=[];
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));r.idx=d.subarray(i*R+NF*4,i*R+NF*4+64000);r.pal=d.subarray(i*R+NF*4+64000,(i+1)*R);rec.push(r)}
const TB=[0x5ddd2,0x5e0d2,0x5e3d2,0x5e6d2], pp=r=>[TB.indexOf(r.q_5e9d2),TB.indexOf(r.q_5e9d6)];
let bf=0,bp=0,np=0,badpal=0,palok=0,skip=0;
for(const r of rec){
  if(r.d_irqs!==r.p_irqs){skip++}
  const Vr=new Uint8Array(4*65536),idx=new Uint8Array(64000);draw(Vr,e,{off:r.d_5d290},r.d_5d2b2);show(Vr,r.d_5d2b2,idx);
  let n=0;for(let j=0;j<64000;j++)if(idx[j]!==r.idx[j])n++; if(n){bf++;bp+=n;if(bf<4)console.log('pixel diff',n,'order',r.order,'row',r.row,'off',r.d_5d290)}
  if(r.p_irqs===r.d_irqs){const pal=new Uint8Array(768);palette({f2c2:r.q_5d2c2,f2a6:r.q_5d2a6,f483:r.q_5f483,w1:r.q_5d272,w2:r.q_5d276,pp:pp(r)},pal,e);palok++;
    for(let j=0;j<768;j++)if(pal[j]!==Math.floor(r.pal[j]*255/63))badpal++}
}
console.log('frames',N,'(frames with a tick during the loop pass:',skip,') pixel: bad frames',bf,'bad px',bp,'| palette: frames checked',palok,'bad bytes',badpal);
// ISR model: ticks before the first sample from the counters, then follow the oracle's IRQ count
const mk=(S,r,t)=>S.off===r[t+'_5d290']&&S.w1===r[t+'_5d272']&&S.w2===r[t+'_5d276']&&S.idx===r[t+'_5d26e']&&S.c27a===r[t+'_5d27a'];   // pure tick counters
const mm=(S,r,t)=>S.f2a6===r[t+'_5d2a6']&&S.f2c2===r[t+'_5d2c2']&&S.f483===r[t+'_5f483']&&S.f47f===r[t+'_5f47f']&&S.last===r[t+'_5f48f'];   // values set from the music row/order (the harness updates the row once per 20000-instruction chunk: one-tick lag)
const snap=(r,t)=>({off:r[t+'_5d290'],f2a6:r[t+'_5d2a6'],f2c2:r[t+'_5d2c2'],f483:r[t+'_5f483'],w1:r[t+'_5d272'],w2:r[t+'_5d276'],idx:r[t+'_5d26e'],c27a:r[t+'_5d27a'],f47f:r[t+'_5f47f'],last:r[t+'_5f48f'],pp:[0,1]});
let S=newState(),N0=-1;
if(e===3){for(let n=0;n<5000&&N0<0;n++){if(S.w1===rec[0].p_5d272&&S.w2===rec[0].p_5d276&&S.idx===rec[0].p_5d26e&&S.c27a===rec[0].p_5d27a)N0=n;isrStep(S,e,rec[0].order,rec[0].row)}}
else N0=0;   // effect 8 inherits effect 3's variables: the model is started from the first snapshot (the inheritance itself is checked in fx08.js against it, see re/NOTES.md)
console.log('ticks before the first sample (from the counters; harness start-up, NINIT)',N0);
S=e===3?newState():snap(rec[0],'p');let n=0,bad={p:0,q:0,d:0},bm=0,ex=[];
const LG=process.argv[4]?new Int32Array(fs.readFileSync(process.argv[4]).buffer.slice(0)):null;   // optional irq log (tools/irqlog2bin.py): the exact order/row of every tick
const adv=(irq,r)=>{const tgt=irq-rec[0].p_irqs+N0;while(n<tgt){const g=rec[0].p_irqs-N0+n+1;isrStep(S,e,...(LG?[LG[g*4+1],LG[g*4+2]]:[r.order,r.row]));n++;if(n===N0)Object.assign(S,{f2c2:0,f2a6:256,off:0})}};
for(const r of rec)for(const t of ['p','q','d']){adv(r[t+'_irqs'],r);if(!mm(S,r,t))bm++;if(!mk(S,r,t)){bad[t]++;if(ex.length<6)ex.push([t,r.order,r.row,n,JSON.stringify(S),V.map(v=>r[t+'_'+v]).join(',')])}}
console.log('ISR model: snapshots with a wrong tick counter (off,c27a,w1,w2,idx)',bad,'of',N,'frames each; music-driven values (flash/fade/..) wrong in',bm,'of',3*N,'snapshots');for(const x of ex)console.log(x.join(' '));
import {VSYNC} from '../web/fx/common.js';
let md=0;rec.forEach((r,k)=>{md=Math.max(md,Math.abs(r.p_irqs-rec[0].p_irqs-Math.floor(k/VSYNC*1193182/17045)))});
console.log('frame pace: max |oracle ticks since the first frame - floor(k/VSYNC*TICK_HZ)| =',md,'ticks (harness frame rate',(N/((rec[N-1].p_irqs-rec[0].p_irqs)/(1193182/17045))).toFixed(2),'fps; port assumes',VSYNC,')');
