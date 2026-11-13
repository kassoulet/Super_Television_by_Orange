#!/usr/bin/env python3
"""fxdiff.py NN DUMPDIR T0 T1 [STEP]: pixel-diff web/fx/fxNN.js against the emulator dumps d<music_t>.npz (re/golden_run.py DUMPEVERY=..).
Env PROBEFRAME=n (+FOFF): drive stateful effects by the emulator's frame counter. Compares the INDEXED frame (exact) and the palette (8-bit as the port outputs it); prints counts and the worst frames. Same pattern as cmp.py."""
import sys,glob,os,subprocess
import numpy as np
nn,d,t0,t1=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]); step=int(sys.argv[5]) if len(sys.argv)>5 else 1
H=os.path.dirname(os.path.abspath(__file__))
fs=[f for f in sorted(glob.glob(d+'/d*.npz')) if t0<=float(os.path.basename(f)[1:-4])<=t1][::step]
ts=[float(os.path.basename(f)[1:-4]) for f in fs]
env=dict(os.environ)
if os.environ.get('PROBEFRAME'):   # stateful effect: frame number = emulator probe #PROBEFRAME (fx9: 662da, probe index 4) instead of a time
    env['FRAMES']=','.join(str(int(np.load(f)['probe'][int(os.environ['PROBEFRAME'])])+int(os.environ.get('FOFF',0))) for f in fs)
raw=subprocess.run(['node',H+'/fxrun.mjs',nn,','.join('%.4f'%t for t in ts)],capture_output=True,check=True,env=env).stdout
R=128000+768+1; badidx=badpal=near=0; palfade=[]; tot=0; worst=[]
for i,f in enumerate(fs):
    z=np.load(f); rec=np.frombuffer(raw[i*R:(i+1)*R],np.uint8); act=rec[0]; idx=rec[1:128001]; pal=rec[128001:]
    g=z['idx'].reshape(-1); gp=(z['pal'].astype(np.uint16)*255//63).astype(np.uint8).reshape(-1)
    if not act: print('t=%.3f port inactive'%ts[i]); continue
    tot+=1; di=int((idx[:g.size]!=g).sum()); dp=int((pal!=gp).sum()); badidx+=di>0; badpal+=dp>0; near+=int(np.abs(pal.astype(int)-gp).max())<=17; worst.append((di,dp,ts[i],int(z['probe'][0])))
print('%d frames compared: %d with index mismatch, %d with palette mismatch (%d of them within one fade step)'%(tot,badidx,badpal,tot-badpal+near-(tot-badpal)))
for w in sorted(worst,reverse=True)[:6]: print(' worst idx_diff=%d pal_diff=%d t=%.3f emu_fade=%d'%w)
