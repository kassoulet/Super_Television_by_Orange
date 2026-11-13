// fx0check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin $(node tools/fx0check.mjs fields); oracle (re/fx_oracle.py): HOOKS=45d6f:p,45dd1:q HOOK2=45e20 FX=0 STATE=<list in F> (see re/NOTES.md fx0).
// Feeds fx00.pass() with the oracle's variables at 0x45d6f (VRAM and noise buffer persist in the port) and compares pixels and palette; optional argv[3] = irq log for the ISR model check.
import fs from 'fs'; import {cbcBase,MEMdump,init,pass,newS,newV,newNoise,display,isrStep} from '../web/fx/fx00.js';
const V='4db5c 4db64 4db68 4db6c 4db70 4db74 4db78 4db7c 4db80 4db84 4db94 4db9c 4dba0 4dba4 4dbb0 4dbb4 4dbb8 4dbbc 4dbd2 4dbe0 4dbe8 4dbec 4dbf0 4dbf4 4dbf8 4dbfc 4dc04 4dc08 4dc40 4dcb8 4dcbc 4dcc0 4dfc8 4dfd0 4f654 4f658 4f660 4f664 550b3 550d7 550db 550e5 554e9'.split(' ');
const F=['order','row','p_irqs','q_irqs',...V.map(v=>'p_'+v),...V.map(v=>'q_'+v)];
if(process.argv[2]==='fields'){console.log(F.join(','));process.exit()}
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx00:rd('fx00.bin'),0:rd('00.bin'),1:rd('01.bin'),3:rd('03.bin'),4:rd('04.bin'),16:rd('16.bin')});
const NF=F.length,R=NF*4+64000+768,d=fs.readFileSync(process.argv[2]),N=d.length/R,rec=[];
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));r.idx=d.subarray(i*R+NF*4,i*R+NF*4+64000);r.pal=d.subarray(i*R+NF*4+64000,(i+1)*R);rec.push(r)}
const f0=rec[0], PA=f0.p_4f660, PB=f0.p_4f664, hi=rec[rec.length-1], P0=hi.p_4f660-0xf2300;   // last record: order 9 renders the final picture (f660 = [4dbe4]+0xf2300)
const OA=0xf2300+64000, OB=OA+64000, ptr=v=>v===PA?OA:v===PB?OB:v-P0;
const nm={b5c:'4db5c',b64:'4db64',b68:'4db68',b6c:'4db6c',b70:'4db70',b74:'4db74',b78:'4db78',b7c:'4db7c',b80:'4db80',b84:'4db84',b94:'4db94',b9c:'4db9c',ba0:'4dba0',ba4:'4dba4',bb0:'4dbb0',bb4:'4dbb4',bb8:'4dbb8',bbc:'4dbbc',bd2:'4dbd2',be0:'4dbe0',be8:'4dbe8',bec:'4dbec',bf0:'4dbf0',bf4:'4dbf4',bf8:'4dbf8',bfc:'4dbfc',c04:'4dc04',c08:'4dc08',c40:'4dc40',cb8:'4dcb8',cbc:'4dcbc',cc0:'4dcc0',fc8:'4dfc8',fd0:'4dfd0',n550b3:'550b3',n550d7:'550d7',n550db:'550db',n550e5:'550e5',n554e9:'554e9'};
const SETS={0x4ea54:0,0x4ed54:1,0x4f054:2,0x4f354:3};
let P=newV(),Nz=newNoise();const idx=new Uint8Array(64000);let pdbg=0,bf=0,bp=0,bpal=0,shown=0,strict=0,sbad=0,amb=0;
const ox=(r,t)=>{const S=newS();for(const k in nm)S[k]=r[t+'_'+nm[k]];S.f660=ptr(r.p_4f660);S.f664=ptr(r.p_4f664);S.sA=SETS[r[t+'_4f654']];S.sB=SETS[r[t+'_4f658']];return S};
const out={};let prev=null;
const cl=()=>[P.map(a=>a.slice()),Nz.slice()];
for(const r of rec){
  // candidate ISR states (an ISR tick can fall between the palette computation, the p snapshot and the render's reads): p, q and the previous pass's q
  const quiet=prev&&prev.q_irqs===r.p_irqs&&r.p_irqs===r.q_irqs;
  const cands=[['p',ox(r,'p')],['q',ox(r,'q')]];if(prev)cands.push(['pq',ox(prev,'q')]);
  {const k=rec.indexOf(r);if(rec[k+1])cands.push(['nx',ox(rec[k+1],'p')]);if(rec[k-1])cands.push(['pv',ox(rec[k-1],'p')])}
  {const a=ox(r,'p');isrStep(a,r.order,r.row);cands.push(['p+t',a]);if(prev){const b=ox(prev,'q');isrStep(b,r.order,r.row);cands.push(['pq+t',b])}}
  // the music row is read live by the render (cs:0x44504/5), the record has it from before: also try the next row
  const nx=r.row===63?[r.order+1,0]:[r.order,r.row+1];for(const c of cands.slice())cands.push([c[0]+'+r',c[1],nx]);
  let best=null,palok=false,pixok=false,okc=null;
  for(const [nmc,S0,rw] of cands){const [oo,rr]=rw||[r.order,r.row];
    if(process.env.DBGF==rec.indexOf(r))console.log('cand',nmc,'f660',S0.f660,'bf4',S0.bf4,'b64',S0.b64,'b68',S0.b68,'bd2',S0.bd2,'n550b3',S0.n550b3,'MEM',MEMdump(0,12859,12862));
    if(prev&&r.order<=4&&r.p_4db78<prev.q_4db78)S0.b78=(S0.cbc-cbcBase(S0))|0;   // reset+clear happened at 0x45d47 before the p snapshot
    const [P2,N2]=cl();const pal6=new Uint8Array(768);const pg=pass(S0,N2,P2,oo,rr,pal6);display(P2,pg,idx);
    let n=0;for(let j=0;j<64000;j++)if(idx[j]!==r.idx[j])n++;let m=0;for(let j=0;j<768;j++)if(pal6[j]!==r.pal[j])m++;
    if(m===0)palok=true;
    if(n===0&&!pixok){pixok=true;okc=nmc;best=[P2,N2]}
    if(!best||(nmc==='p'&&!pixok)){best=[P2,N2,n,m,nmc];if(nmc==='p'){let x0=999,x1=-1,y0=999,y1=-1,ex=null;for(let j=0;j<64000;j++)if(idx[j]!==r.idx[j]){const x=j%320,y=(j/320)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);ex??=[j,idx[j],r.idx[j]]}best.bb=[x0,x1,y0,y1,ex]}}
  }
  [P,Nz]=best;
  if(!pixok&&process.env.DBGF==rec.indexOf(r)){for(let y=0;y<200;y+=5){let l='';for(let x=0;x<320;x+=5)l+=idx[y*320+x]!==r.idx[y*320+x]?'#':(r.idx[y*320+x]>=128?'g':(r.idx[y*320+x]?'p':'.'));console.log(y,l)}
const y=+process.env.DBGY||100;console.log('mine',[...idx.slice(y*320+48,y*320+132)].join(' '));console.log('orac',[...r.idx.slice(y*320+48,y*320+132)].join(' '));console.log('pic ',[...MEMdump(y)].join(' '))}
  if(!pixok){bf++;if(shown++<12)console.log('frame',rec.indexOf(r),'order',r.order,'row',r.row,'irqs',prev&&prev.q_irqs,r.p_irqs,r.q_irqs,'no candidate matches the pixels (p diff',best[2],JSON.stringify(best.bb),'f660',r.p_4f660.toString(16),')')}
  if(!palok)bpal++;
  if(pixok&&okc!=='p')console.log('NONP',rec.indexOf(r),r.order,r.row,okc,quiet);
  if(quiet){strict++;if(!pixok||!palok)sbad++}else if(pixok&&okc!=='p'){amb++;console.log('AMB',rec.indexOf(r),r.order,r.row,okc)}
  (out[r.order]??=[0,0,0])[0]++; if(!pixok)out[r.order][1]++; if(!palok)out[r.order][2]++;
  prev=r;
}
console.log('frames',N,'bad frames (pixels)',bf,'bad frames (palette)',bpal,'| frames without a tick in the window',strict,'bad',sbad,'| matched only with a later state',amb);
console.log('per order [frames,badpix,badpal]',JSON.stringify(out));
