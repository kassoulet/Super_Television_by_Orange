#!/usr/bin/env python3
"""export_assets.py N [N...]: copy re/assets/NN.bin (raw data.dat chunks; RIX3 = 'RIX3',w,h,flag,768 pal(6-bit),pixels) to web/assets/NN.bin"""
import sys,shutil,os
H=os.path.dirname(os.path.abspath(__file__))
for n in sys.argv[1:]: shutil.copy('%s/../re/assets/%02d.bin'%(H,int(n)),'%s/../web/assets/%02d.bin'%(H,int(n)))
