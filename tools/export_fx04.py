#!/usr/bin/env python3
"""export_fx04.py: effect 4 (0x4917b) static data -> web/assets/fx04.bin = sine table 0x4f687 (4096 int32) + 48 palette bytes 0x5f81f (the loop re-reads only the first 16 triplets) from re/mem.bin.gz
(checked against the oracle dump DUMPMEM=5f81f:300); chunks 14 (320x200 picture, 6 bit) and 15 (RIX3: palette +0xa, 4-bit overlay picture +0x30a) copied."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
open(H+'/../web/assets/fx04.bin','wb').write(m[0x4f687:0x4f687+4*4096]+m[0x5f81f:0x5f81f+48])
for n in (14,15): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
