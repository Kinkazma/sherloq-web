"""Generate a bounded exact float32 log oracle and sparse numeric corrections.
Native reference data only; no platform dispatch or runtime calibration.
"""
from pathlib import Path
import hashlib,json,gzip,platform
import numpy as np
assert np.__version__=='1.26.4'
root=Path(__file__).resolve().parents[1];out=root/'fixtures/ela-energy';records=[];corrections=[];lower=0x3a000000;upper=0x45000000;count=0
for start in range(lower,upper+1,1<<20):
 bits=np.arange(start,min(upper+1,start+(1<<20)),dtype=np.uint32);values=bits.view(np.float32);native=np.log(values);wide=np.log(values.astype(np.float64));rounded=wide.astype(np.float32)
 neighbour=np.nextafter(rounded,np.where(wide>=rounded,np.float32(np.inf),np.float32(-np.inf)).astype(np.float32));mid=(rounded.astype(np.float64)+neighbour.astype(np.float64))*.5
 guard=np.abs(wide-mid)<=np.maximum(1,np.abs(wide))*2**-46
 differs=rounded.view(np.uint32)!=native.view(np.uint32);selected=differs|guard
 pairs=np.column_stack((bits[selected],native.view(np.uint32)[selected])).astype('<u4');corrections.append(pairs);count+=len(pairs)
 records.append(dict(start=int(start),length=int(len(bits)),nativeSha256=hashlib.sha256(native.astype('<f4').tobytes()).hexdigest(),differences=int(np.count_nonzero(differs)),guards=int(np.count_nonzero(guard))))
 if len(records)%16==0:print(len(records),'chunks',count,'corrections',flush=True)
raw=np.concatenate(corrections).tobytes();packed=gzip.compress(raw,compresslevel=9,mtime=0);(out/'log-corrections.bin.gz').write_bytes(packed)
native=dict(numpy=np.__version__,system=platform.system(),release=platform.mac_ver()[0],architecture=platform.machine(),extensionSha256=hashlib.sha256(Path(np.core._multiarray_umath.__file__).read_bytes()).hexdigest())
report=dict(schema=1,native=native,numpy=np.__version__,scope='All positive float32 input bit patterns from2^-11 through2^11 inclusive; native NumPy log float32. Corrections versus float64 log rounded tofloat32, plus midpoint guards. No runtime probing.',minimumBits=lower,maximumBits=upper,inputCount=upper-lower+1,records=records,corrections=dict(count=count,bytes=len(raw),compressedBytes=len(packed),sha256=hashlib.sha256(raw).hexdigest(),compressedSha256=hashlib.sha256(packed).hexdigest()))
(out/'log-domain.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['inputCount','corrections']}))

# Portable runtime numerical constants, generated from the same hash-gated table.
import struct
raw=gzip.decompress((root/'fixtures/ela-energy/log-corrections.bin.gz').read_bytes())
words=struct.unpack('<'+'I'*(len(raw)//4),raw)
lines=[','.join(map(str,words[i:i+16])) for i in range(0,len(words),16)]
(root/'src/energy-log-data.js').write_text('// Generated numerical corrections, not model weights or performance calibration.\n// Raw SHA256 '+hashlib.sha256(raw).hexdigest()+'\n// Regenerate using scripts/generate-ela-energy-log-domain.py.\nexport function energyLogData(){return new Uint32Array([\n'+',\n'.join(lines)+'\n]);}\n')
