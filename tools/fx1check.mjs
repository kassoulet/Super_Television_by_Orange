// fx1check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin FIELDS (see F below; re/fx_oracle.py effect 1, HOOKS=472e9:p,47346:p,47302:t,4735f:t,47307:d,47364:d HOOK2=47330,4738d).
// (1) pixels/palette: web/fx/fx01.js half()/palette() fed with the oracle's own per-frame state snapshots; expects 0 bad. (2) ISR model: isrStep() run tick by tick (ticks = oracle ISR count, order/row of the sampled frame; the first frames straddle an order change) must equal the snapshots: counters exactly, fades + order-set values counted.
import fs from 'fs'; import {init,bg,half,palette,isrStep,newState} from '../web/fx/fx01.js';
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx01:rd('fx01.bin'),4:rd('04.bin'),8:rd('08.bin'),9:rd('09.bin')});
const F=['order','row','p_irqs','p_557f4','p_557f8','p_5ca24','t_irqs','t_5627d','t_56281','t_5628d','t_56291','t_56244','t_56248','t_5624c','t_56250','d_irqs','d_5c9ff'], NF=F.length, R=NF*4+64000+768;
const d=fs.readFileSync(process.argv[2]), N=d.length/R, rec=[];
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));r.idx=d.subarray(i*R+NF*4,i*R+NF*4+64000);r.pal=d.subarray(i*R+NF*4+64000,(i+1)*R);rec.push(r)}
const St=r=>({a:r.t_5627d,b:r.t_56281,c:r.t_5628d,d:r.t_56291,m1:r.t_56244,m2:r.t_56248,m3:r.t_5624c,m4:r.t_56250}), Sd=r=>({x:r.d_5c9ff}), Sp=r=>({f4:r.p_557f4,f8:r.p_557f8,ca:r.p_5ca24});
let badf=0,bad=0,badp=0,skip=0,palok=0; const clean=r=>r.t_irqs===r.d_irqs;   // an ISR tick delivered inside 0x46bf2 (the table build) mixes two states: the oracle's snapshots cannot describe such a frame

for(let i=0;i<N;i++){const idx=new Uint8Array(64000),ctx={pal:new Uint8Array(768)}; bg(idx); if(i>=3)half(idx,(i-3)&1,St(rec[i-3]),Sd(rec[i-3])); half(idx,i&1,St(rec[i]),Sd(rec[i]));
  if(rec[i].p_irqs===rec[i].t_irqs){palette(Sp(rec[i]),ctx);let bp=0;for(let j=0;j<768;j++)if(ctx.pal[j]!==Math.floor(rec[i].pal[j]*255/63))bp++;badp+=bp;palok++}   // no tick between the snapshot and the palette load: exact
  if(!clean(rec[i])||(i>=3&&!clean(rec[i-3]))){skip++;continue}
  let n1=0;for(let j=0;j<64000;j++)if(idx[j]!==rec[i].idx[j])n1++; if(n1){badf++;bad+=n1;if(badf<4)console.log('frame',i,'diff',n1)}
}
console.log('skipped (tick inside the table build)',skip,'frames',N,'bad frames',badf,'bad px',bad,'palette frames checked (no tick before the DAC load)',palok,'bad pal bytes',badp);
// ISR model: find the number of ticks N0 before the first sample, then follow
const cnt=(S,r)=>S.a===r.t_5627d&&S.b===r.t_56281&&S.c===r.t_5628d&&S.d===r.t_56291&&S.x===r.d_5c9ff, eq=(S,r)=>cnt(S,r)&&S.m1===r.t_56244&&S.m2===r.t_56248&&S.m3===r.t_5624c&&S.m4===r.t_56250;
let S=newState(),N0=-1;for(let n=0;n<4000&&N0<0;n++){if(cnt(S,rec[0]))N0=n;isrStep(S,rec[0].order,rec[0].row)}
console.log('ticks before the first sample (from the counters)',N0);
S=newState();let n=0,badm=0,badq=0,badf4=0;const adv=(irq,r)=>{const tgt=irq-rec[0].t_irqs+N0;while(n<tgt){isrStep(S,r.order,r.row);n++}};
for(const r of rec){adv(r.p_irqs,r); if(S.f4!==r.p_557f4||S.f8!==r.p_557f8||S.ca!==r.p_5ca24){badf4++;if(process.env.V&&badf4<999)console.log('fade',r.order,r.row,r.p_irqs-rec[0].t_irqs+N0,[S.f4,S.f8,S.ca],[r.p_557f4,r.p_557f8,r.p_5ca24])}
  adv(r.t_irqs,r); if(S.a!==r.t_5627d||S.b!==r.t_56281||S.c!==r.t_5628d||S.d!==r.t_56291)badm++; if(S.m1!==r.t_56244||S.m2!==r.t_56248||S.m3!==r.t_5624c||S.m4!==r.t_56250)badq++;
  adv(r.d_irqs,r); if(S.x!==r.d_5c9ff)badm++}
console.log('ISR model mismatches: counters',badm,'order-set values',badq,'fade state',badf4,'of',N,'frames');
