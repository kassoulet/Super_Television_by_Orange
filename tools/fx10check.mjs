// fx10check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin irqs,a6b34c,a6bc9d,a6bcbd (re/fx_oracle.py HOOK1=4a892 HOOK2=4a973). Feeds the oracle's tick counts into web/fx/fx10.js draw()/palette(), keeping VRAM between frames; expects 0 bad.
import fs from 'fs'; import {init,draw,palette} from '../web/fx/fx10.js';
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({fx10:rd('fx10.bin'),19:rd('19.bin'),20:rd('20.bin')});
const d=fs.readFileSync(process.argv[2]), NF=4, R=NF*4+64000+768, vram=new Uint8Array(64000); let bad=0,badf=0,badp=0,badc=0,i0,n0;
for(let i=0;i<d.length/R;i++){const o=i*R,dv=new DataView(d.buffer,d.byteOffset+o,16),irq=dv.getInt32(0,true),c0=dv.getInt32(4,true),fade=dv.getInt32(8,true),par=dv.getInt32(12,true);
  if(i===0){i0=irq;n0=c0/4}  const n=n0+irq-i0; if((4*n&0xfff)!==c0)badc++;
  draw({n},vram,i&1); const ctx={pal:new Uint8Array(768)}; palette({fade},ctx);
  let n1=0;for(let j=0;j<64000;j++)if(vram[j]!==d[o+16+j])n1++; if(n1){badf++;bad+=n1;if(badf<4)console.log('frame',i,'n',n,'diff',n1)}
  for(let j=0;j<768;j++)if(ctx.pal[j]!==Math.floor(d[o+16+64000+j]*255/63))badp++}
console.log('frames',d.length/R,'bad frames',badf,'bad px',bad,'bad pal',badp,'counter mismatch',badc);
