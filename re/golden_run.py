#!/usr/bin/env python3
"""golden_run.py OUTDIR [IPS=1e6] [EVERY=5] [TMAX=260]: run the whole ORIGINAL demo once, no sound card, with a virtual clock.
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
rows=json.load(open(os.path.dirname(os.path.abspath(__file__))+'/s3mtime.json'))['rows']; TS=[r[3] for r in rows]
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:mu.mem_write(0x4dacc,b'\0\0\0\0'),begin=0x1c2b8,end=0x1c2b8)
CALLS=[0x1c2f9,0x1c31c,0x1c33f,0x1c362,0x1c385,0x1c3a8,0x1c3ba,0x1c3cc,0x1c3ef,0x1c3fd,0x1c41c,0x1c43b,0x1c449]
ENTRYF={}
for i,c in enumerate(CALLS): ENTRYF[struct.unpack('<i',bytes(mu.mem_read(c+1,4)))[0]+c+5]=i
t0=[None]; cur=[-1]; st={}
def fx_enter(uc,a,sz,_):
    cur[0]=ENTRYF[a]; st[cur[0]]=vt[0]+warp[0]; t0[0]=st[0]
for a in ENTRYF: mu.hook_add(UC_HOOK_CODE,fx_enter,begin=a,end=a)
import collections
emu.wrlog=collections.Counter()
if os.environ.get('WRLOG'): mu.hook_add(UC_HOOK_MEM_WRITE,lambda uc,a,s,sz,v,_:emu.wrlog.update([(ireg('EIP'),emu.sq[2],emu.gc[5],emu.gc[8],emu.sq[4])]),begin=0xa0000,end=0xaffff)
assets={}
mu.hook_add(UC_HOOK_CODE,lambda uc,a,sz,_:assets.setdefault(cur[0],[]).append((ireg('EAX'),ireg('EDX'))),begin=0x44c9a,end=0x44c9a)
L=open(out+'/log.txt','w')
def P(*a):
    s=' '.join(map(str,a)); print(s,flush=True); L.write(s+'\n'); L.flush()
DUMPEVERY=float(os.environ.get('DUMPEVERY','0')); DUMPDIR=os.environ.get('DUMPDIR',out+'/dump'); ndump=0
PROBES=[int(x,16) for x in os.environ.get('PROBES','5f48b').split(',')]
if DUMPEVERY: os.makedirs(DUMPDIR,exist_ok=True)
CH=20000; ninstr=0; inside=[False]; nextirq=0.0; irqs=0; iret_hooks=set(); nshot=0; nprobe=0; best=[-1,None,0,0,0]; lastfx=-1
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
    if 8 in intvec and T>=nextirq and not inside[0]:
        h=intvec[8][1]
        if h not in iret_hooks:
            b=bytes(mu.mem_read(h,0x80)); k=b.index(b'\xcf'); iret_hooks.add(h); mu.hook_add(UC_HOOK_CODE,iret_hook,begin=h+k,end=h+k)
        esp=ireg('ESP'); fl=ireg('EFLAGS')
        for v in (fl,8,ireg('EIP')): esp-=4; mu.mem_write(esp,struct.pack('<I',v))
        w('ESP',esp); mu.reg_write(UC_X86_REG_EIP,h); inside[0]=True; irqs+=1; nextirq+=pitperiod()
        if nextirq<T: nextirq=T+pitperiod()
    try: mu.emu_start(ireg('EIP') if ninstr else ENTRY,0,count=CH)
    except UcError as e: P('ERR',e,hex(ireg('EIP'))); break
    ninstr+=CH
P('end irqs',irqs); P('assets (chunk,dest) per effect',{k:[(a,hex(d)) for a,d in v] for k,v in assets.items()})
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
