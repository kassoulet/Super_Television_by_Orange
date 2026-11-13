#!/usr/bin/env python3
"""irqlog2bin.py irqlog.npy OUT.bin: re/fx_oracle.py IRQLOG capture (irq number, order, row, effect, T_us, nextirq_us per injected IRQ0; run with FX=99 TMAX=180 for the whole demo) -> int32 records indexed by irq number-1 (record 0 unused padding), for tools/fx*check.mjs"""
import sys,numpy as np
a=np.load(sys.argv[1]); out=np.zeros((a[-1][0]+2,4),'<i4')
for r in a: out[r[0]]=r[:4]   # 6-column logs (irq, order, row, effect, T_us, next_irq_us): the timing columns are for analysis only
out.tofile(sys.argv[2]); print(len(a),'ticks')
