#!/usr/bin/env python3
"""GENERIC per-frame ORACLE (patched copy of golden_run.py): env HOOK1 (hex addr: state is read just before the render), HOOK2 (hex addr: the VRAM/DAC are read there), FX (effect index; saved and stopped when the next effect starts),
STATE=addr:size,... (hex addr, 1/2/4 bytes: values stored by name 'a<addr>'), SNAPOUT=x.npy. Also stores mt (music time), irqs (ISR tick count), order, row, idx, pal (6-bit).
Effect 2: HOOK1=478e4 HOOK2=47909 FX=2 STATE=5ca44:4,5ca48:4,5ca6e:4,5cf45:4,5cf49:4. Effect 1 (several snapshots per frame): HOOKS=472e9:p,47346:p,47302:t,4735f:t,47307:d,47364:d HOOK2=47330,4738d FX=1 STATE=... Effect 10: HOOK1=4a892 HOOK2=4a973 FX=10 STATE=6b34c:4,...
Usage: SNAPOUT=x.npy PYTHONPATH=. python3 fx_oracle.py OUTDIR 2e7 50 260 (15-30 min).
golden_run.py OUTDIR [IPS=1e6] [EVERY=5] [TMAX=260]: run the whole ORIGINAL demo once, no sound card, with a virtual clock.
The S3M player is not running (card 0), so its sync vars are driven from the S3M timeline (s3mtime.json):
row [0x44504] byte, order [0x44505] word, pattern [0x44507] word (the demo's scenes key on the ORDER). Music t0 = start of effect 0.
Writes OUTDIR/mTTT.png every EVERY music-seconds and OUTDIR/log.txt lines 'effect i start music-time order row'."""
import sys,os,struct,json,bisect
import emu
from emu import *
from emu import warp,vt,pit
from PIL import Image
out=sys.argv[1]; IPS=float(sys.argv[2]) if len(sys.argv)>2 else 1e6
EVERY=float(sys.argv[3]) if len(sys.argv)>3 else 5; TMAX=float(sys.argv[4]) if len(sys.argv)>4 else 260
os.makedirs(out,exist_ok=True)
rows=json.load(open('/home/gautier/SynologyDrive/code/current/demoports/stv/re/s3mtime.json'))['rows']; TS=[r[3] for r in rows]
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:mu.mem_write(0x4dacc,b'\0\0\0\0'),begin=0x1c2b8,end=0x1c2b8)
CALLS=[0x1c2f9,0x1c31c,0x1c33f,0x1c362,0x1c385,0x1c3a8,0x1c3ba,0x1c3cc,0x1c3ef,0x1c3fd,0x1c41c,0x1c43b,0x1c449]
ENTRYF={}
for i,c in enumerate(CALLS): ENTRYF[struct.unpack('<i',bytes(mu.mem_read(c+1,4)))[0]+c+5]=i
t0=[None]; cur=[-1]; st={}
def fx_enter(uc,a,sz,_):
    if ENTRYF[a]==3 and cur[0]==8: return   # effect 8 (0x4856a) falls into effect 3's body 0x485b0: not a new effect
    cur[0]=ENTRYF[a]; st[cur[0]]=vt[0]+warp[0]; t0[0]=st[0]
for a in ENTRYF: mu.hook_add(UC_HOOK_CODE,fx_enter,begin=a,end=a)
import collections
emu.wrlog=collections.Counter()
if os.environ.get('WRLOG'): mu.hook_add(UC_HOOK_MEM_WRITE,lambda uc,a,s,sz,v,_:emu.wrlog.update([(ireg('EIP'),emu.sq[2],emu.gc[5],emu.gc[8],emu.sq[4])]),begin=0xa0000,end=0xaffff)
assets={}
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:assets.setdefault(cur[0],[]).append((ireg('EAX'),ireg('EDX'))),begin=0x44c9a,end=0x44c9a)
L=open(out+'/log.txt','w')
import numpy as np
fr=[];pend=[None]
STATE=[(int(x.split(':')[0],16),int(x.split(':')[1])) for x in os.environ['STATE'].split(',')]; H1=int(os.environ.get('HOOK1','0'),16); H2s=[int(x,16) for x in os.environ['HOOK2'].split(',')]; HOOKS=[(int(x.split(':')[0],16),x.split(':')[1]) for x in os.environ.get('HOOKS','').split(',') if x]; FXI=int(os.environ['FX'])
def d4(x): return int.from_bytes(mu.mem_read(x,4),'little')
def h1(uc,a,sz,_):
    pend[0]=dict(mt=(vt[0]+warp[0]-t0[0]) if t0[0] is not None else -1,irqs=irqs,order=d4(0x44505)&0xffff,row=mu.mem_read(0x44504,1)[0],**{'a%x'%ad:int.from_bytes(mu.mem_read(ad,sz),'little') for ad,sz in STATE})
def h2(uc,a,sz,_):
    if cur[0]!=FXI: pend[0]=None; return   # shared code (effects 3 and 8): only frames of effect FX
    if pend[0] is None: return
    ix,pl=emu.display_idx(); p=pend[0]; p['idx']=ix.copy(); p['pal']=pl.copy(); fr.append(p); pend[0]=None
    if len(fr)==int(os.environ.get('DUMPAT','1')) and os.environ.get('DUMPMEM'):   # DUMPMEM=addr:len,... -> DUMPMEM_OUT.npz (static tables/palettes as the original has them at the first frame)
        np.savez(os.environ['DUMPMEM_OUT'],**{'m%x'%int(x.split(':')[0],16):np.frombuffer(bytes(mu.mem_read(int(x.split(':')[0],16),int(x.split(':')[1],16))),np.uint8) for x in os.environ['DUMPMEM'].split(',')},**{'p%x'%int(x.split(':')[0],16):np.frombuffer(bytes(mu.mem_read(d4(int(x.split(':')[0],16)),int(x.split(':')[1],16))),np.uint8) for x in os.environ.get('DUMPPTR','').split(',') if x})
    if len(fr)>=int(os.environ.get('NFR','300')):
        np.save(os.environ['SNAPOUT'],np.array(fr,dtype=object),allow_pickle=True); emu.exited[0]=1; uc.emu_stop()
if H1: mu.hook_add(UC_HOOK_CODE,h1,begin=H1,end=H1)
for H2 in H2s: mu.hook_add(UC_HOOK_CODE,h2,begin=H2,end=H2)
# HOOKS=addr:tag,...: several snapshot points per frame (fields '<tag>_<addr>', '<tag>_irqs'), all merged into the frame finished at the next HOOK2 (effect 1: 2 frames per loop)
def hk(tag):
    def f(uc,a,sz,_):
        if cur[0]!=FXI: return
        if pend[0] is None: pend[0]=dict(mt=(vt[0]+warp[0]-t0[0]) if t0[0] is not None else -1,order=d4(0x44505)&0xffff,row=mu.mem_read(0x44504,1)[0])
        pend[0][tag+'_irqs']=irqs; pend[0].update({tag+'_%x'%ad:int.from_bytes(mu.mem_read(ad,sz),'little') for ad,sz in STATE})
    return f
for a_,tg in HOOKS: mu.hook_add(UC_HOOK_CODE,hk(tg),begin=a_,end=a_)
def P(*a):
    s=' '.join(map(str,a)); print(s,flush=True); L.write(s+'\n'); L.flush()
DUMPEVERY=float(os.environ.get('DUMPEVERY','0')); DUMPDIR=os.environ.get('DUMPDIR',out+'/dump'); ndump=0
NOIRQ=[tuple(int(y,16) for y in x.split('-')) for x in os.environ['NOIRQ'].split(',')] if os.environ.get('NOIRQ') else None   # NOIRQ=lo-hi[,lo-hi...]
PROBES=[int(x,16) for x in os.environ.get('PROBES','5f48b').split(',')]
if DUMPEVERY: os.makedirs(DUMPDIR,exist_ok=True)
irqlog=[]; CH=20000; ninstr=0; inside=[False]; nextirq=0.0; irqs=0; iret_hooks=set(); nshot=0; nprobe=0; best=[-1,None,0,0,0]; lastfx=-1
def pitperiod():
    v=[x for x in pit if not isinstance(x,tuple)]
    d=(v[-2]|(v[-1]<<8)) if len(v)>=2 else 0
    return (d or 65536)/1193182.0
def iret_hook(uc,a,sz,_): inside[0]=False
while not emu.exited[0]:
    vt[0]=ninstr/IPS; T=vt[0]+warp[0]; clk[0]=int(T*1e6)
    if t0[0] is not None:
        mt=T-t0[0]; k=max(0,bisect.bisect_right(TS,mt)-1); o,p,r,_=rows[k]
        mu.mem_write(0x44504,bytes([r])+struct.pack('<HH',o,p))
        if cur[0]!=lastfx and fr: np.save(os.environ['SNAPOUT'],np.array(fr,dtype=object),allow_pickle=True); emu.exited[0]=1; break
        if cur[0]!=lastfx: lastfx=cur[0]; P('effect',cur[0],'music_t=%.2f order=%d row=%d wall=%.0f'%(mt,o,r,__import__('time').process_time()))
        if mt>=nprobe*0.2:
            nprobe+=1; im=display()
            if im.shape[0]>=16:
                br=im.mean()
                if br>best[0]: best[:]=[br,im.copy(),o,r,cur[0]]
        if mt>=(nshot+1)*EVERY:
            if best[1] is not None: Image.fromarray(best[1]).save('%s/m%03d.png'%(out,nshot*EVERY)); P(' shot m%03d fx%d order %d row %d brightness %.1f'%(nshot*EVERY,best[4],best[2],best[3],best[0]))
            nshot+=1; best[:]=[-1,None,0,0,0]
        if DUMPEVERY and mt>=ndump*DUMPEVERY:
            ndump+=1; ix,pl=emu.display_idx()
            if ix.shape[0]>=16:
                import numpy as np
                np.savez_compressed('%s/d%07.3f.npz'%(DUMPDIR,mt),idx=ix,pal=pl,mt=mt,order=o,row=r,fx=cur[0],probe=np.array([int.from_bytes(mu.mem_read(a_,4),'little') for a_ in PROBES],dtype=np.int64))
        if mt>TMAX: break
    if 8 in intvec and T>=nextirq and not inside[0] and not (NOIRQ and any(lo<=ireg('EIP')<hi for lo,hi in NOIRQ)):   # NOIRQ=lo-hi (hex): no IRQ0 is injected while EIP is in this range (the tick is delayed to the next 20000-instruction chunk); used to get snapshots that describe a whole table build
        h=intvec[8][1]
        if h not in iret_hooks:
            b=bytes(mu.mem_read(h,0x80)); k=b.index(b'\xcf'); iret_hooks.add(h); mu.hook_add(UC_HOOK_CODE,iret_hook,begin=h+k,end=h+k)
        esp=ireg('ESP'); fl=ireg('EFLAGS')
        for v in (fl,8,ireg('EIP')): esp-=4; mu.mem_write(esp,struct.pack('<I',v))
        w('ESP',esp); mu.reg_write(UC_X86_REG_EIP,h); inside[0]=True; irqs+=1; irqlog.append((irqs,d4(0x44505)&0xffff,mu.mem_read(0x44504,1)[0],cur[0],int(T*1e6),int(nextirq*1e6))); nextirq+=pitperiod()
        if nextirq<T: nextirq=T+pitperiod()
    try: mu.emu_start(ireg('EIP') if ninstr else ENTRY,0,count=CH)
    except UcError as e: P('ERR',e,hex(ireg('EIP'))); break
    ninstr+=CH
P('end irqs',irqs)
if os.environ.get('IRQLOG'): np.save(os.environ['IRQLOG'],np.array(irqlog,dtype=np.int32))
P('assets (chunk,dest) per effect',{k:[(a,hex(d)) for a,d in v] for k,v in assets.items()})
if os.environ.get('DBG'):
    import numpy as np
    print('crtc',{k:hex(v) for k,v in emu.crtc.items() if v},'sq',emu.sq,'gc',{k:v for k,v in emu.gc.items() if v})
    for i in range(4):
        b=np.frombuffer(bytes(emu.planes[i]),np.uint8); c=np.bincount(b,minlength=256); print('plane',i,'distinct',(c>0).sum(),'top',c.argsort()[::-1][:6],c[c.argsort()[::-1][:6]])
    print('wr count by eip',emu.wrlog.most_common(6) if hasattr(emu,'wrlog') else None)
    print('modes',emu.modes if hasattr(emu,'modes') else None)
if os.environ.get('DBG'):
    print('pal max',max(max(p) for p in emu.pal),'nonzero',sum(1 for p in emu.pal if max(p)),'5f48b',int.from_bytes(mu.mem_read(0x5f48b,4),'little'),'bytes@a0000',bytes(mu.mem_read(0xa0000,16)).hex())
    print('eip',hex(ireg('EIP')),'mt',mt)
if os.environ.get('DBG'):
    p=int.from_bytes(mu.mem_read(0x5d312,4),'little'); print('buf ptr',hex(p),bytes(mu.mem_read(p,32)).hex(), 'nz', sum(1 for b in bytes(mu.mem_read(p,0xfd0a)) if b))
    print('5d342',bytes(mu.mem_read(0x5d342,16)).hex(),'5d952',bytes(mu.mem_read(0x5d952,16)).hex())

if os.environ.get('DBG2'):
    p=int.from_bytes(mu.mem_read(0x4dad0,4),'little'); print('file ptr',hex(p)); 
    import numpy as np
    b=np.frombuffer(bytes(mu.mem_read(p,0x284028)),np.uint8); print('nonzero bytes in-memory file',np.count_nonzero(b),'of',len(b))
    d=np.frombuffer(open(emu.ROOT+'/data.dat','rb').read(),np.uint8); print('first diff',np.nonzero(b!=d)[0][:5] if len(d)==len(b) else 'len')
