"""Probe integer vectors near BRISK's 1024 orientation-bin boundaries, offline."""
from pathlib import Path
import ctypes,hashlib,json,math,platform,struct
assert platform.system()=='Darwin', 'Pinned native libSystem reference required'
root=Path(__file__).resolve().parents[1]
library=ctypes.CDLL('/usr/lib/libSystem.B.dylib');atan=library.atan2f
atan.argtypes=[ctypes.c_float,ctypes.c_float];atan.restype=ctypes.c_float
f=lambda n:struct.unpack('f',struct.pack('f',n))[0]
rows=[]
for k in range(1024):
    angle=(k+.5)*2*math.pi/1024
    for radius in [1000,10000,100000,250000,1000000]:
        x=round(math.cos(angle)*radius);y=round(math.sin(angle)*radius)
        for dx in range(-2,3):
            for dy in range(-2,3):
                a=x+dx;b=y+dy;raw=f(atan(b,a)/math.pi*180.)
                rounded=f(f(math.atan2(f(b),f(a)))/math.pi*180.)
                rows.append([a,b,raw,0 if raw==-1 else int(1024*(raw/360.)+.5)%1024,rounded])
path=root/'.build/brisk-boundary-study.json'
path.write_text(json.dumps(dict(schema=1,columns=['x','y','nativeRawDegrees','nativeBin','doubleRoundedRawDegrees'],rows=rows))+'\n')
print(len(rows),'integer vectors; sha256',hashlib.sha256(path.read_bytes()).hexdigest())
