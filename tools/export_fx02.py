#!/usr/bin/env python3
"""export_fx02.py: effect 2 (TV logo lens, 0x476b4) static data -> web/assets/fx02.bin = sine table 0x4f687 (5121 int32, +1025 entries wrap used as cosine) ; chunks 2, 6, 7 copied."""
import gzip,os,shutil,struct
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
t=struct.unpack('<5121i',m[0x4f687:0x4f687+4*5121])
open(H+'/../web/assets/fx02.bin','wb').write(m[0x4f687:0x4f687+4*5121])
for n in (2,6,7): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
