#!/usr/bin/env python3
"""export_fx10.py: effect 10 (0x4a62f) static data -> web/assets/fx10.bin = sine table 0x662ec (4096 int32); chunks 19 and 20 copied."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
open(H+'/../web/assets/fx10.bin','wb').write(m[0x662ec:0x662ec+4*4096])
for n in (19,20): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
