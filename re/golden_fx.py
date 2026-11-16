#!/usr/bin/env python3
"""golden_fx.py OUTDIR BUDGET_SEC [IPS] [SHOTS]: run the ORIGINAL main sequence (13 effects, called from main at 0x1c2f9..0x1c449)
with a virtual clock, each effect cut after BUDGET_SEC virtual seconds (main resumes at the instruction after its call), PNG screenshots at SHOTS
(comma list of seconds after the effect started) -> OUTDIR/eNN_tSS.png, and a log of the data.dat assets each effect extracts (0x44c9a).
no card (ULTRASND/BLASTER absent) makes main bail out, so the 'no card' flag [0x4dacc] is cleared at 0x1c2b8: card 0 = silent, the S3M player never ticks."""
import sys,os,struct,json
from emu import *
from emu import warp,vt,pit
from PIL import Image
out=sys.argv[1]; BUD=float(sys.argv[2]); IPS=float(sys.argv[3]) if len(sys.argv)>3 else 8e6
SHOTS=[float(x) for x in (sys.argv[4] if len(sys.argv)>4 else '1,3,6,9,12').split(',')]
os.makedirs(out,exist_ok=True)
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:mu.mem_write(0x4dacc,b'\0\0\0\0'),begin=0x1c2b8,end=0x1c2b8)
CALLS=[0x1c2f9,0x1c31c,0x1c33f,0x1c362,0x1c385,0x1c3a8,0x1c3ba,0x1c3cc,0x1c3ef,0x1c3fd,0x1c41c,0x1c43b,0x1c449]
ENTRYF={}
for i,c in enumerate(CALLS): ENTRYF[struct.unpack('<i',bytes(mu.mem_read(c+1,4)))[0]+c+5]=(i,c+5)
cur=[None]; est=[0.0]; assets={}; shots_done=set()
def fx_enter(uc,a,sz,_):
    i,ret=ENTRYF[a]; cur[0]=(i,ret,ireg('ESP')); est[0]=vt[0]+warp[0]; shots_done.clear(); assets[i]=[]; print('EFFECT',i,hex(a),'start t=%.2f'%est[0],flush=True)
for a in ENTRYF: mu.hook_add(UC_HOOK_CODE,fx_enter,begin=a,end=a)
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:assets[cur[0][0]].append(ireg('EAX')) if cur[0] else None,begin=0x44c9a,end=0x44c9a)
CH=20000; ninstr=0; inside=[False]; nextirq=0.0; irqs=0; iret_hooks=set()
def pitperiod():
    v=[x for x in pit if not isinstance(x,tuple)]
    d=(v[-2]|(v[-1]<<8)) if len(v)>=2 else 0
    return (d or 65536)/1193182.0
def iret_hook(uc,a,sz,_): inside[0]=False
log=[]
while True:
    vt[0]=ninstr/IPS; T=vt[0]+warp[0]; clk[0]=int(T*1e6)
    if cur[0]:
        i,ret,esp0=cur[0]; dt=T-est[0]
        for s in SHOTS:
            if dt>=s and s not in shots_done:
                shots_done.add(s); im=display()
                if im.shape[0]>=16 and im.shape[1]>=16: Image.fromarray(im).save('%s/e%02d_t%02d.png'%(out,i,s)); print(' shot e%d t+%g %dx%d'%(i,s,im.shape[1],im.shape[0]),flush=True)
        if dt>=BUD:
            print(' cut effect',i,'irqs',irqs,'assets',assets[i],flush=True)
            if i==len(CALLS)-1: break
            mu.reg_write(UC_X86_REG_EIP,ret); w('ESP',esp0+4); inside[0]=False; cur[0]=None
    if 8 in intvec and T>=nextirq and not inside[0]:
        h=intvec[8][1]
        if h not in iret_hooks:
            b=bytes(mu.mem_read(h,0x80)); k=b.index(b'\xcf'); iret_hooks.add(h); mu.hook_add(UC_HOOK_CODE,iret_hook,begin=h+k,end=h+k)
        esp=ireg('ESP'); fl=ireg('EFLAGS')
        for v in (fl,8,ireg('EIP')): esp-=4; mu.mem_write(esp,struct.pack('<I',v))
        w('ESP',esp); mu.reg_write(UC_X86_REG_EIP,h); inside[0]=True; irqs+=1; nextirq+=pitperiod()
        if nextirq<T: nextirq=T+pitperiod()
    try: mu.emu_start(ireg('EIP') if ninstr else ENTRY,0,count=CH)
    except UcError as e: print('ERR',e,hex(ireg('EIP'))); break
    ninstr+=CH
json.dump({str(k):v for k,v in assets.items()},open(out+'/assets_used.json','w'))
