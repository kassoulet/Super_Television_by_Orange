#!/usr/bin/env python3
"""export_fx01.py MEM.npz: effect 1 (0x4705f) static data -> web/assets/fx01.bin = sine table 0x56fdf (512 int32, from re/mem.bin.gz) + the 2x384 palette bytes at 0x566c1 as the original has them
at the first frame (after its copies at 0x47041/0x4729e; MEM.npz = DUMPMEM=566c1:900 of re/fx_oracle.py); chunks 4, 8, 9 copied."""
import gzip,os,shutil,sys,numpy as np
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read(); z=np.load(sys.argv[1])['m566c1']
open(H+'/../web/assets/fx01.bin','wb').write(m[0x56fdf:0x56fdf+2048]+bytes(z[:768]))
for n in (4,8,9): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
