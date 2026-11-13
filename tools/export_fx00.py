#!/usr/bin/env python3
"""export_fx00.py: effect 0 (0x45a30) static data -> web/assets/fx00.bin from re/mem.bin.gz (pristine image; checked equal to the oracle dump at the first frame):
sine table 0x4f687 (4096 dwords), table 0x5068b (2049 dwords), row->picture tables 0x550e9/0x551e9/0x552e9 (64 dwords each), 7 palettes of 0x180 bytes
(0x4dfd4, 0x4e2d4, 0x4e5d4, sets 0x4ea54 0x4ed54 0x4f054 0x4f354), bytes 0x4db90..93 (orders that restart the fade at row 0x3f).
Chunks 0, 1 (textures), 3 (31 RLE pictures 320x100), 4 (final picture), 16 (RLE 40x25x300 animation) are copied from re/assets."""
import gzip,os,shutil
H=os.path.dirname(os.path.abspath(__file__)); m=gzip.open(H+'/../re/mem.bin.gz').read()
b=m[0x4f687:0x4f687+16384]+m[0x5068b:0x5068b+2049*4]
for a in (0x550e9,0x551e9,0x552e9): b+=m[a:a+256]
for a in (0x4dfd4,0x4e2d4,0x4e5d4,0x4ea54,0x4ed54,0x4f054,0x4f354): b+=m[a:a+0x180]
b+=m[0x4db90:0x4db94]
open(H+'/../web/assets/fx00.bin','wb').write(b)
for n in (0,1,3,4,16): shutil.copy('%s/../re/assets/%02d.bin'%(H,n),'%s/../web/assets/%02d.bin'%(H,n))
