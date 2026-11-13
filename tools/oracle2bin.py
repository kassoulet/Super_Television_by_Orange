#!/usr/bin/env python3
"""oracle2bin.py X.npy OUT.bin FIELD,FIELD,..: records [int32 fields][idx 64000][pal 768 (6-bit)] from a re/fx_oracle.py capture, for tools/fx*check.mjs"""
import sys,numpy as np
fr=np.load(sys.argv[1],allow_pickle=True); F=sys.argv[3].split(',')
with open(sys.argv[2],'wb') as f:
    for p in fr: f.write(np.array([p.get(k,0) for k in F],dtype=np.int64).astype('<i4').tobytes()+np.asarray(p['idx'],np.uint8).tobytes()+np.asarray(p['pal'],np.uint8).tobytes())
print(len(fr),'frames')
