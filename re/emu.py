#!/usr/bin/env python3
"""emu.py - run the ORIGINAL (unpacked) 'Super Television' code under Unicorn.
State = re/mem.bin.gz (raw 64 MB dump taken after PMODE/W loaded the program; gunzip it to $STV_MEM or re/mem.bin).
Code = linear 0x3a000.. (obj1, entry _cstart 0x4ab5c, Watcom), data = same region up to 0x6d000 + 0x100000.. copy; flat model, DS base 0.
Host-side: DOS int21 (file I/O for data.dat / makako.s3m), DPMI int31, VGA mode 13h (+ palette ports 3c8/3c9), virtual clock.
usage:  python3 emu.py [seconds_wall]   (smoke run: logs the int/port traffic)
"""
exited=[0]
import os,struct,sys,collections,gzip
from unicorn import *
from unicorn.x86_const import *
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=HERE+'/..'
R=lambda n:getattr(sys.modules['unicorn.x86_const'],'UC_X86_REG_'+n)
ENTRY=0x4ab5c
FILES={'data.dat':open(ROOT+'/data.dat','rb').read(),'makako.s3m':open(ROOT+'/makako.s3m','rb').read()}
mu=Uc(UC_ARCH_X86,UC_MODE_32)
mu.mem_map(0,0x10000000)
_m=os.environ.get('STV_MEM') or HERE+'/mem.bin'
mu.mem_write(0,(open(_m,'rb').read() if os.path.exists(_m) else gzip.open(HERE+'/mem.bin.gz').read()))
GDT=0x30000000; mu.mem_map(GDT,0x100000)
def desc(code,acc=None): return struct.pack('<HHBBBB',0xffff,0,0,acc or (0x9b if code else 0x93),0xcf,0)
g=b''.join(desc(i==1) for i in range(256)); mu.mem_write(GDT,g)
mu.mem_write(GDT+0x10,struct.pack('<HHBBBB',0x3fff,0,0,0x93,0xc0,0))   # DS limit 64 MB (Watcom sbrk uses lsl)
mu.reg_write(UC_X86_REG_GDTR,(0,GDT,len(g)-1,0))
LDT=GDT+0x10000
mu.mem_write(LDT,b''.join(desc(False,0xf3) for i in range(256)))
mu.reg_write(UC_X86_REG_LDTR,(0x30,LDT,255*8+7,0x82))
mu.reg_write(UC_X86_REG_CR0,mu.reg_read(UC_X86_REG_CR0)|1)
for r,s in [('CS',8),('DS',0x10),('ES',0x10),('SS',0x10),('FS',0x10),('GS',0x10)]: mu.reg_write(R(r),s)
mu.reg_write(UC_X86_REG_ESP,0x3f0000)
def ireg(n): return mu.reg_read(R(n))
def w(r,v): mu.reg_write(R(r),v&0xffffffff)
def wax(v): w('EAX',(ireg('EAX')&0xffff0000)|(v&0xffff))
def setcf(v): f=ireg('EFLAGS'); mu.reg_write(UC_X86_REG_EFLAGS,(f|1) if v else (f&~1))
PSP=0x30020000; mu.mem_write(PSP+0x80,b'\x00\x0d'); mu.mem_write(PSP+0x5c,struct.pack('<I',0x400000))
def setdesc(idx,base,limit=0xfffff):
    mu.mem_write(LDT+idx*8,struct.pack('<HHBBBB',limit&0xffff,base&0xffff,(base>>16)&0xff,0xf3,0xc0|(limit>>16),(base>>24)&0xff))
setdesc(4,PSP)   # selector 0x24 = PSP
def cstr(a):
    b=b''
    while True:
        c=bytes(mu.mem_read(a,1))
        if c==b'\0': return b.decode('latin1')
        b+=c; a+=1
ARENA=0x20000000; mu.mem_map(ARENA,0x10000000); arena_ptr=[ARENA]
def aalloc(n): a=arena_ptr[0]; arena_ptr[0]+=(n+0xfff)&~0xfff; return a
nextsel=[0x40]; dosptr=[0x80000]
files={}; nextfd=[5]
cnt=collections.Counter(); log=[]
# ---- virtual clock: one tick = 1/70 s? PIT 18.2 Hz BIOS tick is derived from `clk` (centiseconds via int21/2c) ----
clk=[0]           # microseconds of virtual time
KEYQ=[]
intvec={}         # PM interrupt vectors set by the program (int21/25, DPMI 0205): n -> (sel, off)
def dpmi(uc):
    ax=ireg('EAX')&0xffff; bx=ireg('EBX')&0xffff; cx=ireg('ECX')&0xffff; dx=ireg('EDX')&0xffff; setcf(0)
    if ax==0x0000: n=cx; wax((nextsel[0]<<3)|7); nextsel[0]+=n; return True
    if ax==0x0006: w('ECX',0); w('EDX',0); return True
    if ax==0x0007: setdesc(bx>>3,(cx<<16)|dx); return True
    if ax in(0x0008,0x0009,0x000b,0x0003): return True
    if ax==0x000a: wax((nextsel[0]<<3)|7); nextsel[0]+=1; return True
    if ax==0x0100: a=dosptr[0]; dosptr[0]+=bx*16; wax(a>>4); w('EDX',(nextsel[0]<<3)|7); setdesc(nextsel[0],a); nextsel[0]+=1; return True
    if ax==0x0101: return True
    if ax in(0x0200,0x0204): w('ECX',0); w('EDX',0); return True
    if ax==0x0205: intvec[bx&0xff]=(cx,ireg('EDX')); return True
    if ax in(0x0201,0x0600,0x0601,0x0602,0x0603): return True
    if ax==0x0400: wax(0x0090); w('EBX',3); w('ECX',4); w('EDX',0x0870); return True
    if ax==0x0500:
        a=ireg('EDI'); mu.mem_write(a,struct.pack('<12I',0x4000000,0x4000,0x4000,0x4000,0x8000,0x4000,0x4000,0x8000,0x1000,0,0,0)); return True
    if ax==0x0501: n=(bx<<16)|cx; a=aalloc(n); w('EBX',a>>16); w('ECX',a&0xffff); w('ESI',0); w('EDI',a&0xffff|1); return True
    if ax==0x0502: return True
    if ax==0x0800: sz=((ireg('ESI')&0xffff)<<16)|(ireg('EDI')&0xffff); a=aalloc(max(sz,0x400000)); w('EBX',a>>16); w('ECX',a&0xffff); return True
    if ax==0x0300: print('DPMI sim rm int',hex(bx)); return True
    return False
curmode=[3]; modes=[]
def setbiosmode(m):
    if m&0x7f==0x13:
        for i,v in enumerate([0x5f,0x4f,0x50,0x82,0x54,0x80,0xbf,0x1f,0,0x41,0,0,0,0,0,0,0x9c,0x8e,0x8f,0x28,0x40,0x96,0xb9,0xa3,0xff]): crtc[i]=v
        sq.update({1:1,2:0xf,3:0,4:0xe}); gc.update({0:0,1:0,2:0,3:0,4:0,5:0x40,6:5,7:0xf,8:0xff})
        for p in planes: p[:]=bytes(len(p))
def hostfile(name):
    n=name.lower().replace('\\','/').split('/')[-1]
    return FILES.get(n)
def intr(uc,no,_):
    eax=ireg('EAX'); ah=(eax>>8)&0xff; al=eax&0xff
    cnt[(no,ah if no!=0x31 else eax&0xffff)]+=1
    if no==0x21:
        if ah==0x30:
            if ireg('EBX')==0x50484152: w('EAX',0x44580005); w('EBX',0x34); return
            w('EAX',5); return
        if ah==0xff: w('EAX',0); return
        if ah==0x4a: n=ireg('EBX'); mu.mem_write(GDT+0x10,struct.pack('<HHBBBB',(n-1)&0xffff,0,0,0x93,0xc0|(((n-1)>>16)&15),0)); setcf(0); return
        if ah==0x2c:
            t=clk[0]//10000; w('ECX',((t//360000)%24<<8)|((t//6000)%60)); w('EDX',(((t//100)%60)<<8)|(t%100)); return
        if ah==0x2a: w('ECX',1996); w('EDX',(8<<8)|17); wax(0x2a00|6); return
        if ah==0x35: w('EBX',intvec.get(al,(0,0))[1]); return
        if ah==0x25: intvec[(ireg('ECX')&0xff) if al==4 else al]=(ireg('DS'),ireg('EDX')); return   # AL=4: PMODE/W 'set IRQ vector CL'
        if ah==0x0b: wax(0xff00 if KEYQ else 0); return
        if ah in(0x07,0x08,0x01): wax(KEYQ.pop(0) if KEYQ else 0); return
        if ah==0x44: w('EDX',0x80); setcf(0); return
        if ah==0x3d:
            n=cstr(ireg('EDX')); f=hostfile(n); print('OPEN',n,f is not None)
            if f is None: wax(2); setcf(1); return
            fd=nextfd[0]; nextfd[0]+=1; files[fd]=[f,0]; wax(fd); setcf(0); return
        if ah==0x3c: fd=nextfd[0]; nextfd[0]+=1; files[fd]=[b'',0]; wax(fd); setcf(0); return
        if ah==0x3e: files.pop(ireg('EBX')&0xffff,None); setcf(0); return
        if ah==0x3f:
            f=files.get(ireg('EBX')&0xffff); n=ireg('ECX')
            if f is None: wax(6); setcf(1); return
            b=f[0][f[1]:f[1]+n]; mu.mem_write(ireg('EDX'),b); f[1]+=len(b); wax(len(b)); setcf(0); return
        if ah==0x42:
            f=files.get(ireg('EBX')&0xffff)
            if f is None: wax(6); setcf(1); return
            o=struct.unpack('<i',struct.pack('<I',(ireg('ECX')<<16|ireg('EDX'))&0xffffffff))[0]
            f[1]=o if al==0 else f[1]+o if al==1 else len(f[0])+o
            wax(f[1]&0xffff); w('EDX',f[1]>>16); setcf(0); return
        if ah==0x40:
            n=ireg('ECX'); b=bytes(mu.mem_read(ireg('EDX'),n)); print('[write %d] '%ireg('EBX')+b.decode('latin1').rstrip()); wax(n); setcf(0); return
        if ah==0x09: print('PRINT',cstr(ireg('EDX')).split('$')[0]); return
        if ah==0x4c: print('EXIT',al); exited[0]=1; uc.emu_stop(); return
        if ah==0x48 or ah==0x49: setcf(1); return
        if ah in(0x1a,0x0e,0x19): return
    if no==0x10:
        if ah==0: curmode[0]=al; setbiosmode(al); modes.append(al); print('SETMODE',hex(al),'t=%.2f'%(clk[0]/1e6)); return
        if ah==0x0e: sys.stdout.write(chr(al)); return
        if ah==0x0f: wax((80<<8)|curmode[0]); return
        if ah in(1,2,5,6,7,9,0x0a,0x0b,0x0c,0x10,0x11,0x12): return
        if ah==3: w('ECX',0x0607); w('EDX',0); return
    if no==0x16:
        if ah in(0,0x10): wax(KEYQ.pop(0) if KEYQ else 0); return
        if ah in(1,0x11):
            f=ireg('EFLAGS'); mu.reg_write(UC_X86_REG_EFLAGS,(f&~0x40) if KEYQ else (f|0x40)); 
            if KEYQ: wax(KEYQ[0])
            return
    if no==0x33: wax(0); return           # mouse: not installed
    if no==0x2f and eax&0xffff==0x1686: wax(0); return
    if no==0x31 and dpmi(uc): return
    print(f"UNHANDLED INT {no:02x} ax={eax&0xffff:04x} ebx={ireg('EBX'):x} ecx={ireg('ECX'):x} edx={ireg('EDX'):x} eip={ireg('EIP'):x}")
    uc.emu_stop()
mu.hook_add(UC_HOOK_INTR,intr)
def mem_inv(uc,access,addr,size,val,_): print('MEMFAULT',access,hex(addr),size,'eip',hex(ireg('EIP'))); return False
mu.hook_add(UC_HOOK_MEM_UNMAPPED,mem_inv)
# ---- ports: VGA retrace / palette, PIT ----
pal=[[0,0,0] for _ in range(256)]; pstate={'wi':0,'comp':0,'ri':0,'rcomp':0}
warp=[0.0]; vt=[0.0]
ports={}; inctr=[0]; portlog=collections.Counter()
def _in(uc,port,size,_):
    if port==0x3da:
        # retrace: virtual-time based (70 Hz for <=400 lines, else 60 Hz); every poll warps the clock 60 us so spin loops stay cheap
        warp[0]+=60e-6; t=vt[0]+warp[0]; per=1/(59.94 if crtc[0x12]==0xdf else 70.086); ph=(t%per)/per
        return (9 if ph>0.93 else 0)
    if port==0x40: return (65535-(inctr[0]*37))&0xff
    if port==0x3c9:
        v=pal[pstate['ri']][pstate['rcomp']]; pstate['rcomp']+=1
        if pstate['rcomp']==3: pstate['rcomp']=0; pstate['ri']=(pstate['ri']+1)&255
        return v
    if port==0x3d5: return crtc[crtci[0]]
    if port==0x3cf: return gc[gci[0]]
    if port==0x3c5: return sq[sqi[0]]
    return ports.get(port,0)
def _out(uc,port,size,val,_):
    portlog[('out',port)]+=1; ports[port]=val
    if port==0x3c8: pstate['wi']=val&255; pstate['comp']=0
    elif port==0x3c7: pstate['ri']=val&255; pstate['rcomp']=0
    elif port==0x3c9:
        pal[pstate['wi']][pstate['comp']]=val&63; pstate['comp']+=1
        if pstate['comp']==3: pstate['comp']=0; pstate['wi']=(pstate['wi']+1)&255
mu.hook_add(UC_HOOK_INSN,_in,None,1,0,UC_X86_INS_IN)

# ---- planar VGA (mode X family): shadow planes fed from memory hooks on 0xa0000..0xaffff ----
planes=[bytearray(0x10000) for _ in range(4)]; latch=[0,0,0,0]
sq={i:0 for i in range(8)}; gc={i:0 for i in range(16)}; crtc={i:0 for i in range(0x20)}; sqi=[0]; gci=[0]; crtci=[0]
sq[2]=0xf
_PAL=pal
def _out(uc,port,size,val,_):
    if port==0x3c9:
        ps=pstate; _PAL[ps['wi']][ps['comp']]=val&63; c=ps['comp']+1
        if c==3: c=0; ps['wi']=(ps['wi']+1)&255
        ps['comp']=c; return
    if size==2 and port in(0x3c4,0x3ce,0x3d4): _out(uc,port,1,val&255,_); _out(uc,port+1,1,val>>8,_); return
    if port==0x3c4: sqi[0]=val&7
    elif port==0x3c5: sq[sqi[0]]=val
    elif port==0x3ce: gci[0]=val&15
    elif port==0x3cf: gc[gci[0]]=val
    elif port==0x3d4: crtci[0]=val&31
    elif port==0x3d5: crtc[crtci[0]]=val
    elif port==0x40: pit.append(val)
    elif port==0x43: pit.append(('c',val))
    elif port==0x3c8: pstate['wi']=val&255; pstate['comp']=0
    elif port==0x3c7: pstate['ri']=val&255; pstate['rcomp']=0
    ports[port]=val
pit=[]
mu.hook_add(UC_HOOK_INSN,_out,None,1,0,UC_X86_INS_OUT)
def _wr(uc,access,addr,size,val,_):
    if not (0xa0000<=addr<0xb0000): return
    o=addr-0xa0000
    for i in range(size):
        b=(val>>(8*i))&255; wmode(o+i,b)
def wmode(o,b):
    if not sq[4]&8 and gc[5]&3==0 and gc[3]==0 and gc[1]==0 and gc[8]==0xff:   # fast path: plain write, map mask only
        mm=sq[2]
        if mm==15:
            for p in planes: p[o]=b
        else:
            for p in range(4):
                if mm>>p&1: planes[p][o]=b
        return
    if sq[4]&8: p=o&3; planes[p][o>>2]=b; return   # chain4 (mode 13h): not modelled for display except as linear
    a=o; wm=gc[5]&3; mm=sq[2]; rot=gc[3]&7
    if wm==1:
        for p in range(4):
            if mm>>p&1: planes[p][a]=latch[p]
        return
    if wm==0:
        b=((b>>rot)|(b<<(8-rot)))&255
        for p in range(4):
            if not mm>>p&1: continue
            v=b
            if gc[1]>>p&1: v=255 if gc[0]>>p&1 else 0     # set/reset
            f=(gc[3]>>3)&3; bm=gc[8]
            l=latch[p]
            if f==1: v&=l
            elif f==2: v|=l
            elif f==3: v^=l
            planes[p][a]=(v&bm)|(l&~bm&255)
    elif wm==2:
        bm=gc[8]
        for p in range(4):
            if not mm>>p&1: continue
            v=255 if b>>p&1 else 0; l=latch[p]; f=(gc[3]>>3)&3
            if f==1: v&=l
            elif f==2: v|=l
            elif f==3: v^=l
            planes[p][a]=(v&bm)|(l&~bm&255)
    elif wm==3: 
        bm=b&gc[8]
        for p in range(4):
            if not mm>>p&1: continue
            v=255 if gc[0]>>p&1 else 0; l=latch[p]; planes[p][a]=(v&bm)|(l&~bm&255)
def _rd(uc,access,addr,size,val,_):
    if not (0xa0000<=addr<0xb0000): return
    o=addr-0xa0000
    if sq[4]&8:
        for i in range(size): mu.mem_write(addr+i,bytes([planes[(o+i)&3][(o+i)>>2]]))
        return
    for p in range(4): latch[p]=planes[p][o]
    rm=gc[4]&3
    for i in range(size): mu.mem_write(addr+i,bytes([planes[rm][o+i]]))
mu.hook_add(UC_HOOK_MEM_WRITE,_wr,begin=0xa0000,end=0xaffff)
mu.hook_add(UC_HOOK_MEM_READ,_rd,begin=0xa0000,end=0xaffff)
def display_idx():
    """(indices (h,w) uint8, palette copy (256,3) 6-bit) of what the CRT shows now"""
    import numpy as np
    r=crtc; wpx=(r[1]+1)*4
    ov=r[7]; h=((ov&2)<<7|(ov&0x40)<<3|r[0x12])+1; h//=((r[9]&0x1f)+1)
    start=(r[0xc]<<8|r[0xd])&0xffff; stride=max(r[0x13]*2,1)
    P=np.array([np.frombuffer(bytes(p),np.uint8) for p in planes])
    ys=np.arange(h)[:,None]; xs=np.arange(wpx)[None,:]
    idx=(start+ys*stride+(xs>>2))&0xffff
    return P[xs&3,idx], np.array(pal,dtype=np.uint8)
def display():
    """what the CRT shows now: RGB uint8 array (h,w,3), from planar shadow + CRTC + DAC"""
    import numpy as np
    out,p=display_idx()
    return (p.astype(np.uint16)[out]*255//63).astype(np.uint8)

# Unicorn cannot hook OUTS: emulate the 28 'rep outsb' of the program (palette uploads) by code hooks (cld assumed)
import json
def _rep_outsb(uc,a,sz,_):
    dx=ireg('EDX')&0xffff; esi=ireg('ESI'); n=ireg('ECX')
    for b in bytes(mu.mem_read(esi,n)): _out(uc,dx,1,b,None)
    w('ESI',esi+n); w('ECX',0); mu.reg_write(UC_X86_REG_EIP,a+2)
for _a in json.load(open(HERE+'/rep_outsb.json')): mu.hook_add(UC_HOOK_CODE,_rep_outsb,begin=_a,end=_a)
def run(start=ENTRY,n=2000000000):
    try: mu.emu_start(start,0,count=n)
    except UcError as e: print('ERR',e,'eip',hex(ireg('EIP')))
def frame_rgb():
    import numpy as np
    a=np.frombuffer(bytes(mu.mem_read(0xa0000,64000)),dtype=np.uint8).reshape(200,320)
    p=np.array(pal,dtype=np.uint16)*255//63; p=p.astype(np.uint8)
    return p[a]
if __name__=='__main__':
    run(n=int(float(sys.argv[1] if len(sys.argv)>1 else 50)*1e6))
    print('eip',hex(ireg('EIP')),'modes',modes); print(sorted(cnt.items(),key=lambda x:-x[1])[:25]); print(sorted(portlog.items(),key=lambda x:-x[1])[:25])
