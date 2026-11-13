// fx02check.mjs STATES.bin: draw()+palette of web/fx/fx02.js vs the per-frame oracle (re/fx2_oracle.py -> fx2fr.npy, exported as records [A,B,C,off,fade int32][idx 64000][pal 768 6-bit]); expect 0 bad.
import fs from 'fs'; import {init,draw} from '../web/fx/fx02.js';
const A=new URL('../web/assets/',import.meta.url).pathname;
const rd=n=>fs.readFileSync(A+n); await init({fx02:rd('fx02.bin'),2:rd('02.bin'),6:rd('06.bin'),7:rd('07.bin')});
const d=fs.readFileSync(process.argv[2]); const R=20+64000+768; let bad=0,badf=0;
for(let i=0;i<d.length/R;i++){const o=i*R, dv=new DataView(d.buffer,d.byteOffset+o,20);
  const st={A:dv.getInt32(0,true),B:dv.getInt32(4,true),C:dv.getInt32(8,true),off:dv.getInt32(12,true),fade:dv.getInt32(16,true)};
  const idx=new Uint8Array(64000); draw(st,idx); let n=0; for(let j=0;j<64000;j++)if(idx[j]!==d[o+20+j])n++;
  if(n){badf++; if(badf<5)console.log('frame',i,st,'diff',n)} bad+=n}
console.log('frames',d.length/R,'bad frames',badf,'bad px',bad)
import {setPal} from '../web/fx/common.js';
const C6=rd('06.bin').subarray(10,778); let pb=0;
for(let i=0;i<d.length/R;i++){const o=i*R,fade=new DataView(d.buffer,d.byteOffset+o+16,4).getInt32(0,true);const ctx={pal:new Uint8Array(768)};setPal(ctx,C6,fade);for(let j=0;j<768;j++)if(ctx.pal[j]!==Math.floor(d[o+20+64000+j]*255/63)){pb++;if(pb<4)console.log('pal',i,fade,j,ctx.pal[j],d[o+20+64000+j])}}
console.log('pal bad',pb);
