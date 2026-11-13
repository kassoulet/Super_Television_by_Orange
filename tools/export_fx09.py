#!/usr/bin/env python3
"""export_fx09.py: effect 9 (TV static) static tables from the unpacked image (re/mem.bin.gz, identical at effect entry) -> web/assets/fx09.bin
= 0x65072 (256) + 0x65172 (256) + 0x6567e (256 int32 offsets) + 0x65a96 (768, 6-bit palette) + LCG seeds 0x65272/76/7a (3 x u32). Also copies chunk 18."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
open(H+'/../web/assets/fx09.bin','wb').write(m[0x65072:0x65172]+m[0x65172:0x65272]+m[0x6567e:0x65a7e]+m[0x65a96:0x65d96]+m[0x65272:0x65272+4]+m[0x65276:0x65276+4]+m[0x6527a:0x6527a+4])
shutil.copy(H+'/../re/assets/18.bin',H+'/../web/assets/18.bin')
