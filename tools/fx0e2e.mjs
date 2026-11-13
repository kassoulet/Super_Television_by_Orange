// fx0e2e.mjs STATES.bin IRQ.json: end-to-end check of fx00.js from its own initial state (newS): ISR ticks replayed with the oracle's per-tick (order,row) (irqlog columns 1..3: irq, order, row),
// each pass run with the oracle's tick count and (order,row); pixels/palette compared with the oracle frames (same record format as tools/fx0check.mjs).
import fs from 'fs'; import {init,pass,newS,newV,newNoise,display,isrStep,reset} from '../web/fx/fx00.js';
const V='4db5c 4db64 4db68 4db6c 4db70 4db74 4db78 4db7c 4db80 4db84 4db94 4db9c 4dba0 4dba4 4dbb0 4dbb4 4dbb8 4dbbc 4dbd2 4dbe0 4dbe8 4dbec 4dbf0 4dbf4 4dbf8 4dbfc 4dc04 4dc08 4dc40 4dcb8 4dcbc 4dcc0 4dfc8 4dfd0 4f654 4f658 4f660 4f664 550b3 550d7 550db 550e5 554e9'.split(' ');
const F=['order','row','p_irqs','q_irqs',...V.map(v=>'p_'+v),...V.map(v=>'q_'+v)];
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx00:rd('fx00.bin'),0:rd('00.bin'),1:rd('01.bin'),3:rd('03.bin'),4:rd('04.bin'),16:rd('16.bin')});
const NF=F.length,R=NF*4+64000+768,d=fs.readFileSync(process.argv[2]),N=d.length/R,irq=JSON.parse(fs.readFileSync(process.argv[3]));
const S=newS(),P=newV(),Nz=newNoise(),idx=new Uint8Array(64000),pal6=new Uint8Array(768);reset();
const NI=new DataView(d.buffer,d.byteOffset,NF*4).getInt32(8,true);S.n=NI;   // ticks before the loop entry (0x45bfc) are no-ops in the ISR (0x550e5==0 -> only the counter): NINIT, a harness measurement
let bp=0,bpal=0,first=null;const per={};
for(let i=0;i<N;i++){const dv=new DataView(d.buffer,d.byteOffset+i*R,NF*4),r={};F.forEach((k,j)=>r[k]=dv.getInt32(j*4,true));
  const ri=d.subarray(i*R+NF*4,i*R+NF*4+64000),rp=d.subarray(i*R+NF*4+64000,(i+1)*R);
  while(S.n<r.p_irqs){const [,o,w]=irq[S.n];isrStep(S,o,w)}
  if(process.env.DIFF&&i===+process.env.DIFF){const nm={b5c:'4db5c',b64:'4db64',b68:'4db68',b6c:'4db6c',b70:'4db70',b74:'4db74',b78:'4db78',b7c:'4db7c',b80:'4db80',b84:'4db84',b94:'4db94',b9c:'4db9c',ba0:'4dba0',ba4:'4dba4',bb0:'4dbb0',bb4:'4dbb4',bb8:'4dbb8',bbc:'4dbbc',bd2:'4dbd2',be0:'4dbe0',be8:'4dbe8',bec:'4dbec',bf0:'4dbf0',bf4:'4dbf4',bf8:'4dbf8',bfc:'4dbfc',c04:'4dc04',c08:'4dc08',c40:'4dc40',cb8:'4dcb8',cbc:'4dcbc',cc0:'4dcc0',fc8:'4dfc8',fd0:'4dfd0',n550b3:'550b3',n550d7:'550d7',n550db:'550db',n550e5:'550e5',n554e9:'554e9'};for(const k in nm)if(S[k]!==r['p_'+nm[k]])console.log('  state',k,S[k],'oracle',r['p_'+nm[k]])}
  const pg=pass(S,Nz,P,r.order,r.row,pal6);display(P,pg,idx);
  let n=0;for(let j=0;j<64000;j++)if(idx[j]!==ri[j])n++;let m=0;for(let j=0;j<768;j++)if(pal6[j]!==rp[j])m++;
  const e=per[r.order]??=[0,0,0];e[0]++;if(n){e[1]++;bp++;first??=[i,r.order,r.row,n]}if(m){e[2]++;bpal++}}
console.log('frames',N,'bad pixel frames',bp,'bad palette frames',bpal,'first bad',first,'\nper order [frames,badpix,badpal]',JSON.stringify(per));
