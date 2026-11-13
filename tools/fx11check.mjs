// fx11check.mjs STATES.bin: tools/oracle2bin.py X.npy S.bin a5f498,irqs (re/fx_oracle.py HOOK1=47dff HOOK2=47e46 FX=11 STATE=5f498:4): draw() with the oracle's counter vs its VRAM; expects 0 bad.
import fs from 'fs'; import {init,draw} from '../web/fx/fx11.js';
const A=new URL('../web/assets/',import.meta.url).pathname, rd=n=>fs.readFileSync(A+n);
await init({20:rd('20.bin'),27:rd('27.bin')});
const d=fs.readFileSync(process.argv[2]), R=8+64000+768; let bad=0,badf=0;
for(let i=0;i<d.length/R;i++){const o=i*R,n=new DataView(d.buffer,d.byteOffset+o,8).getInt32(0,true),idx=new Uint8Array(64000);draw(n,idx);
  let c=0;for(let j=0;j<64000;j++)if(idx[j]!==d[o+8+j])c++; if(c){badf++;bad+=c;if(badf<4)console.log('frame',i,'n',n,'diff',c)}}
import {render} from '../web/fx/fx11.js'; const ctx={idx:new Uint8Array(128000),pal:new Uint8Array(768)}; render(240,ctx); let bp=0; for(let j=0;j<768;j++)if(ctx.pal[j]!==Math.floor(d[8+64000+j]*255/63))bp++;
console.log('bad pal bytes',bp);
console.log('frames',d.length/R,'bad frames',badf,'bad px',bad);
