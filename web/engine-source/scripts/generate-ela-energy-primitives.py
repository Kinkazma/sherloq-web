"""Generate public ELA gray/blur oracles without enabling energy analysis."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_energy import describe_energy
assert np.__version__=='1.26.4' and cv.__version__=='4.11.0'
out=root/'.build/ela-energy-primitives';out.mkdir(exist_ok=True);rng=np.random.default_rng(280001);records=[]
for h,w in [(1,1),(1,2),(2,1),(1,7),(7,1),(2,3),(3,4),(4,5),(5,6),(6,7),(7,8),(7,15),(7,16),(7,17),(19,31),(21,32),(23,33),(65,129),(129,257),(1024,1031)]:
 for kind in ['flat','noise','ramps']:
  a=rng.integers(0,256,(h,w,3),dtype=np.uint8);b=rng.integers(0,256,(h,w,3),dtype=np.uint8)
  if kind=='flat':a[:]=(13,99,250);b[:]=(123,15,250)
  if kind=='ramps':a=np.arange(h*w*3,dtype=np.uint8).reshape(h,w,3);b=np.full_like(a,127)
  name=f'{kind}-{w}-{h}';diff=np.abs(a.astype(np.float32)-b.astype(np.float32));gray=cv.cvtColor(diff,cv.COLOR_BGR2GRAY);energy=describe_energy(a,b)
  cv.cvtColor(a,cv.COLOR_BGR2RGB).tofile(out/(name+'-a.rgb'));cv.cvtColor(b,cv.COLOR_BGR2RGB).tofile(out/(name+'-b.rgb'));gray.astype('<f4').tofile(out/(name+'-gray.f32'));energy.astype('<f4').tofile(out/(name+'-blur.f32'))
  records.append(dict(name=name,width=w,height=h));print(name,flush=True)
source=root.parent/'source/gui/sherloq_app/core/ela_energy.py';(out/'reference.json').write_text(json.dumps(dict(cases=records,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest()),indent=2)+'\n')

from pathlib import Path
import numpy as np,cv2 as cv,hashlib,json
root=Path(__file__).resolve().parents[1];rows=[]
g,b=np.indices((256,256));a=np.empty((256,256,3),np.float32);a[:,:,0]=b;a[:,:,1]=g
for r in range(256):
 a[:,:,2]=r
 vector=cv.cvtColor(a.reshape(1,65536,3),cv.COLOR_BGR2GRAY)
 scalar=cv.cvtColor(a.reshape(65536,1,3),cv.COLOR_BGR2GRAY)
 rows.append(dict(red=r,vectorSha256=hashlib.sha256(vector.astype('<f4').tobytes()).hexdigest(),scalarSha256=hashlib.sha256(scalar.astype('<f4').tobytes()).hexdigest()))
source=root.parent/'source/gui/sherloq_app/core/ela_energy.py'
(root/'.build/ela-energy-primitives/gray-domain.json').write_text(json.dumps(dict(schema=1,scope='All 16777216 RGB8 residual colours in SIMD and scalar native float32 gray paths',opencv=cv.__version__,numpy=np.__version__,cases=rows,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest()),indent=2)+'\n')
print(len(rows),'red slices, both native accumulation orders')

import gzip
base=root/'.build/ela-energy-primitives'
reference=json.loads((base/'reference.json').read_text());payload=bytearray();records=[]
for row in reference['cases']:
 record=dict(row)
 for key,suffix in [('original','-a.rgb'),('compressed','-b.rgb'),('gray','-gray.f32'),('energy','-blur.f32')]:
  raw=(base/(row['name']+suffix)).read_bytes();record[key]=dict(offset=len(payload),length=len(raw));payload.extend(raw)
 records.append(record)
packed=gzip.compress(payload,compresslevel=9,mtime=0);output=root/'fixtures/ela-energy';output.mkdir(exist_ok=True)
(output/'primitives.bin.gz').write_bytes(packed)
(output/'primitives.json').write_text(json.dumps(dict(schema=1,scope='Generated residual-gray/blur primitives only, not ELA energy decisions or biomes',sourceSha256=reference['sourceSha256'],seed=280001,cases=records,payload=dict(bytes=len(payload),compressedBytes=len(packed),sha256=hashlib.sha256(payload).hexdigest(),compressedSha256=hashlib.sha256(packed).hexdigest())),indent=2)+'\n')
(output/'gray-domain.json').write_text((base/'gray-domain.json').read_text())
print(len(records),'primitive pairs',len(packed),'compressed bytes')
