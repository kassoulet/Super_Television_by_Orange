// node fxrun.mjs NN t1,t2,... : renders web/fx/fxNN.js at those music times; stdout = per time [active u8][idx 128000 (first 320*ctx.h used)][pal 768]
// env PHASE = vsync phase; env FRAMES=k1,k2,.. forces ctx.frame (stateful effects: frame number instead of a time)
import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const H=path.dirname(fileURLToPath(import.meta.url));
const [,,nn,ts]=process.argv;const m=await import(`${H}/../web/fx/fx${nn}.js`);
const assets={};for(const f of fs.readdirSync(H+'/../web/assets'))assets[/^\d/.test(f)?parseInt(f):f.replace('.bin','')]=Uint8Array.from(fs.readFileSync(H+'/../web/assets/'+f)).buffer;
await m.init(assets);
const FR=process.env.FRAMES&&process.env.FRAMES.split(',').map(Number);let n=0;
const out=[];for(const t of ts.split(',').map(Number)){const ctx={idx:new Uint8Array(128000),pal:new Uint8Array(768),phase:Number(process.env.PHASE||0),h:200,frame:FR?FR[n++]:undefined};const a=m.render(t,ctx);
  out.push(Buffer.concat([Buffer.from([a?1:0]),Buffer.from(ctx.idx),Buffer.from(ctx.pal)]))}
process.stdout.write(Buffer.concat(out));
