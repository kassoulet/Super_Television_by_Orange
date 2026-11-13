#!/usr/bin/env python3
"""export_fx05.py: effect 5 (0x495c1) static data -> web/assets/fx05.bin = table 0x606b8 (256 bytes: height curve) + ISR parameter table 0x607aa (24 rows x 5 dwords, 20 bytes per order) from re/mem.bin.gz
(checked against the oracle dump DUMPMEM=607aa:..,606b8:100); chunks 5 (160x100 words), 10 (RIX3: palette +0xa, picture +0x30a), 11 (64K shading table), 17 (picture +0x30a), 21 (overlay: palette +0xa, picture +0x30a) copied."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
open(H+'/../web/assets/fx05.bin','wb').write(m[0x606b8:0x606b8+256]+m[0x607aa:0x607aa+24*20])
for n in (5,10,11,17,21): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
