// fx5check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin FIELDS (`node tools/fx5check.mjs fields`); oracle (re/fx_oracle.py): HOOKS=49552:p,498d7:q,49a21:f HOOK2=4996f,49a75 FX=5 NFR=100000
// STATE=609da:4,609de:4,609e2:2,60780:4,60788:4,6079c:2,6079e:4,607a2:4,61026:4,60ffe:4,61036:4. (1) pixels: ball()+blit() fed with the oracle's [0x609e2] at 0x49552 (persistent VRAM from zero), composite + fade frames;
// (2) palette from [0x60ffe]*[0x61026] at 0x498d7 / fade value [0x61036]; (3) ISR model: replay from the cold state, ticks = oracle IRQ count; (4) pace (ticks per pass).
import fs from 'fs'; import {init,ball,blit,palette,isrStep,newS,overlay} from '../web/fx/fx05.js';
const V=['609da','609de','609e2','60780','60788','6079c','6079e','607a2','61026','60ffe','61036'];
const F=['order','row',...['p','q','f'].map(t=>t+'_irqs'),...['p','q','f'].flatMap(t=>V.map(v=>t+'_'+v))];
if(process.argv[2]==='fields'){console.log(F.join(','));process.exit()}
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx05:rd('fx05.bin'),5:rd('05.bin'),10:rd('10.bin'),11:rd('11.bin'),17:rd('17.bin'),21:rd('21.bin')});
const NF=F.length,R=NF*4+64000+768,d=fs.readFileSync(process.argv[2]),N=d.length/R,rec=[];
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));r.idx=d.subarray(i*R+NF*4,i*R+NF*4+64000);r.pal=d.subarray(i*R+NF*4+64000,(i+1)*R);rec.push(r)}
const VR=new Uint8Array(64000),B=new Uint8Array(16000),pal=new Uint8Array(768);let nm=0,nf=0,bp=0,bf=0,bpal=0,palc=0,ov=false;
for(const r of rec){
  if(r.f_irqs===0&&r.p_irqs!==0){ball(r.p_609e2&0xffff,B);blit(B,VR,null);nm++;palette(r.q_60ffe*r.q_61026,16,pal)}
  else{if(!ov){blit(B,VR,overlay());ov=true}nf++;palette(r.f_61036,8,pal)}
  let n=0;for(let j=0;j<64000;j++)if(VR[j]!==r.idx[j])n++;if(n){bf++;bp+=n;if(bf<4)console.log('pixel diff',n,'order',r.order,'row',r.row,'main',r.f_irqs===0)}
  let m=0;for(let j=0;j<768;j++)if(pal[j]!==Math.floor(r.pal[j]*255/63))m++;if(m){bpal++;if(bpal<4)console.log('pal diff',m,'main',r.f_irqs===0,r.q_60ffe,r.q_61026,r.f_61036)}
}
console.log('frames',N,'main',nm,'fade/composite',nf,'| bad frames (pixels)',bf,'bad px',bp,'| bad frames (palette)',bpal);
const first=rec.find(r=>r.p_irqs!==0);
const cnt=(S,r,t,all)=>S.a===r[t+'_609da']&&S.b===r[t+'_609de']&&S.off===r[t+'_609e2']&&S.p9e===r[t+'_6079e']&&S.p7a===r[t+'_607a2']&&S.f26===r[t+'_61026']&&(!all||S.f0e===r[t+'_60ffe']);
let S=newS(),N0=-1;for(let n=0;n<20000&&N0<0;n++){if(cnt(S,first,'p'))N0=n;isrStep(S,first.order,first.row)}
console.log('ticks before the first sample N0',N0,'first [60ffe]',first.p_60ffe);
// replay: f0e reset to 4 at tick N0-(first f0e-4)
const LG=process.argv[3]?new Int32Array(fs.readFileSync(process.argv[3]).buffer.slice(0)):null; // irq log (re/fx_oracle.py IRQLOG, tools/irqlog2bin.py): [irq#, order, row, fx] per injected tick
const nr=N0-(first.p_60ffe-4); S=newS();let n=0,bc=0,tot=0;const ord=r=>[r.order,r.row];
for(const r of rec){const tg=r.f_irqs===0?['p','q']:['f'];for(const t of tg){const tgt=r[t+'_irqs']-first.p_irqs+N0;while(n<tgt){{const g=first.p_irqs-N0+n+1,L=LG?[LG[g*4+1],LG[g*4+2]]:ord(r);isrStep(S,...L)}n++;if(n===nr)S.f0e=4}tot++;if(!cnt(S,r,t,t!=='f')){bc++;if(bc<6)console.log('mismatch',t,'order',r.order,'row',r.row,'n',n,JSON.stringify(S),V.map(v=>r[t+'_'+v]).join(' '))}}}
console.log('ISR model (reset tick',nr,'): wrong snapshots',bc,'of',tot);
let hist={};rec.filter(r=>r.f_irqs===0).forEach((r,k,a)=>{if(k)hist[r.p_irqs-a[k-1].p_irqs]=(hist[r.p_irqs-a[k-1].p_irqs]||0)+1});console.log('ticks per main pass histogram',JSON.stringify(hist));
const fi=rec.filter(r=>r.f_irqs!==0);hist={};fi.forEach((r,k,a)=>{if(k)hist[r.f_irqs-a[k-1].f_irqs]=(hist[r.f_irqs-a[k-1].f_irqs]||0)+1});console.log('ticks per fade frame histogram',JSON.stringify(hist),'fade frames',fi.length);
