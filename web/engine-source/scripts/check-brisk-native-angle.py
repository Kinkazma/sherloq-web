"""Native system math oracle. Does not copy or distribute a system library."""
from pathlib import Path
import argparse,ctypes,hashlib,json,math,platform,struct
parser=argparse.ArgumentParser();parser.add_argument('--expanded',action='store_true');args=parser.parse_args()
assert platform.system()=='Darwin', 'This pinned native reference uses Darwin libSystem atan2f'
root=Path(__file__).resolve().parents[1];base=root/('.build/brisk-expanded-study' if args.expanded else '.build/cloning-study')
path=base/'brisk-directions.json';data=json.loads(path.read_text())
f=lambda n:struct.unpack('f',struct.pack('f',n))[0]
library=ctypes.CDLL('/usr/lib/libSystem.B.dylib')
atan=library.atan2f;atan.argtypes=[ctypes.c_float,ctypes.c_float];atan.restype=ctypes.c_float
def bin_index(degrees):
    if degrees==-1:return 0  # BRISK sentinel: force rotation zero
    value=int(1024*(degrees/360.)+.5)
    return value%1024
results={mode:dict(differingAngles=0,maxDegrees=0,changedDescriptorBins=0) for mode in ['system-atan2f','wasm-atan2f','double-rounded-to-float']}
for x,y,wasm,native,wasm_raw in data['rows']:
    radians=atan(y,x);raw=f(radians/math.pi*180.)
    for mode,raw_value in [('system-atan2f',raw),('wasm-atan2f',wasm_raw),('double-rounded-to-float',f(f(math.atan2(f(y),f(x)))/math.pi*180.))]:
        angle=f(raw_value+360.) if raw_value<0 else raw_value
        if mode=='wasm-atan2f':assert angle==wasm
        record=results[mode];record['differingAngles']+=angle!=native;record['maxDegrees']=max(record['maxDegrees'],abs(angle-native))
        record['changedDescriptorBins']+=bin_index(raw_value)!=bin_index(raw)
assert results['system-atan2f']['differingAngles']==0
proof=dict(schema=1,scope='offline native orientation oracle; no system-library code shipped',vectors=len(data['rows']),expanded=args.expanded,referenceSource=data['referenceSource'],vectorsSha256=hashlib.sha256(path.read_bytes()).hexdigest(),results=results)
dest=root/('docs/brisk-angle-expanded-study.json' if args.expanded else 'docs/brisk-angle-study.json');dest.write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2))
