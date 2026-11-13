#!/usr/bin/env python3
"""export_fx03.py: effects 3 and 8 (engine 0x485b0) static data -> web/assets/fx03.bin = palette A 0x5d952[0:0x180] + the 4 palette tables 0x5ddd2..0x5e9d2 (4x0x300), from re/mem.bin.gz (checked against the oracle dump DUMPMEM); chunks 13 and 23 (RLE, 0x493e0 bytes each) copied."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
open(H+'/../web/assets/fx03.bin','wb').write(m[0x5d952:0x5d952+0x180]+m[0x5ddd2:0x5ddd2+0xc00])
for n in (13,23): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
