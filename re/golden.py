#!/usr/bin/env python3
"""golden.py OUTDIR T0 T1 STEP [IPS]: run the original with a virtual clock (guest instructions / IPS, default 30 MIPS),
deliver IRQ0 (vector 8, rate from the PIT divisor the demo programs) and save the CRT picture every STEP virtual seconds as PNG.
no-sound mode: the demo bails out when ULTRASND/BLASTER are absent, so [0x4dacc] ('no card' flag) is forced to 0 at 0x1c2b8: card 0 = silent."""
import sys,os,struct
from emu import *
from emu import warp,vt,pit
from PIL import Image
out=sys.argv[1]; t0=float(sys.argv[2]); t1=float(sys.argv[3]); step=float(sys.argv[4]); IPS=float(sys.argv[5]) if len(sys.argv)>5 else 30e6
os.makedirs(out,exist_ok=True)
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:mu.mem_write(0x4dacc,b'\0\0\0\0'),begin=0x1c2b8,end=0x1c2b8)
CH=20000
ninstr=0; inside=[False]; nextirq=0.0; nextshot=t0; irqs=0
def pitperiod():
    v=[x for x in pit if not isinstance(x,tuple)]
    d=(v[-2]|(v[-1]<<8)) if len(v)>=2 else 0
    return (d or 65536)/1193182.0
def iret_hook(uc,a,sz,_): inside[0]=False
iret_hooks=set()
eip=ENTRY; T=0.0
while True:
    vt[0]=ninstr/IPS; T=vt[0]+warp[0]; clk[0]=int(T*1e6)
    if T>=nextshot:
        im=display()
        if im.shape[0]<16 or im.shape[1]<16: nextshot+=step; continue
        Image.fromarray(im).save('%s/t%07.2f.png'%(out,T)); print('%.2f %dx%d irqs=%d eip=%x'%(T,im.shape[1],im.shape[0],irqs,ireg('EIP')),flush=True); nextshot+=step
    if T>=t1: break
    if 8 in intvec and T>=nextirq and not inside[0]:
        h=intvec[8][1]
        if h not in iret_hooks:     # find the handler's iret (first 0xcf after entry)
            b=bytes(mu.mem_read(h,0x80)); i=b.index(b'\xcf'); iret_hooks.add(h); mu.hook_add(UC_HOOK_CODE,iret_hook,begin=h+i,end=h+i)
        esp=ireg('ESP'); fl=ireg('EFLAGS')
        for v in (fl,8,ireg('EIP')): esp-=4; mu.mem_write(esp,struct.pack('<I',v))
        w('ESP',esp); mu.reg_write(UC_X86_REG_EIP,h); inside[0]=True; irqs+=1; nextirq+=pitperiod()
        if nextirq<T: nextirq=T+pitperiod()
    try: mu.emu_start(ireg('EIP') if ninstr else ENTRY,0,count=CH)
    except UcError as e: print('ERR',e,hex(ireg('EIP'))); break
    ninstr+=CH
    if os.environ.get('DBG') and (ninstr//CH)%100==0: print('dbg',T,hex(ireg('EIP')),irqs,warp[0],len(pit),flush=True)
