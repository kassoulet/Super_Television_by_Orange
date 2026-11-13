#!/usr/bin/env python3
"""fx09check.py DUMPDIR [T0 T1 STEP]: effect 9 vs the emulator dumps (golden_run.py PROBES=5f48b,65272,65276,6527a,662da,... DUMPEVERY=0.05).
The emulator samples the screen at an arbitrary instruction, i.e. in the middle of a frame (in-place drawing, two plane passes), so a dump
is a mix of frame n (finished, probe 662da) and frame n+1. Check: exact frames, and that EVERY pixel of every other dump is equal to the port's frame n or n+1."""
import sys,os,glob,subprocess
import numpy as np
d=sys.argv[1]; t0,t1,st=(float(sys.argv[2]),float(sys.argv[3]),int(sys.argv[4])) if len(sys.argv)>4 else (175.5,201.6,5)
H=os.path.dirname(os.path.abspath(__file__))
fs=[f for f in sorted(glob.glob(d+'/d*.npz')) if t0<=float(os.path.basename(f)[1:-4])<=t1][::st]
zs=[np.load(f) for f in fs]; cnt=[int(z['probe'][4]) for z in zs]
def run(frames):
    raw=subprocess.run(['node',H+'/fxrun.mjs','09',','.join(['180']*len(frames))],capture_output=True,check=True,env=dict(os.environ,FRAMES=','.join(map(str,frames)))).stdout
    R=128769; return [np.frombuffer(raw[i*R+1:i*R+1+128000],np.uint8) for i in range(len(frames))]
cur,nxt=run(cnt),run([c+1 for c in cnt]); exact=mixed=bad=0
for z,a,b in zip(zs,cur,nxt):
    g=z['idx'].reshape(-1)
    if (g==a).all(): exact+=1
    elif (((g==a)|(g==b)).all()): mixed+=1
    else: bad+=1
print('%d dumps (frames 0..%d): %d exact, %d mixed frame n/n+1 (mid-draw), %d unexplained'%(len(zs),max(cnt),exact,mixed,bad))
