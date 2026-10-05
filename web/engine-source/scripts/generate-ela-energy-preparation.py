"""Publishable synthetic oracle for energy preparation, independent of private images."""
from pathlib import Path
import sys,json,gzip,hashlib,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_energy import describe_energy,prepare_energy
from gui.sherloq_app.core.jpeg import compress_jpg
out=root/'fixtures/ela-energy';out.mkdir(exist_ok=True);rng=np.random.default_rng(280005);records=[];payload=bytearray()
def put(data):
 while len(payload)%4:payload.append(0)
 raw=data.tobytes();row=dict(offset=len(payload),length=len(raw));payload.extend(raw);return row
for h,w in [(7,9),(8,8),(9,9),(17,25),(35,57),(65,97),(193,257)]:
 for kind in ['flat','noise','panels']:
  a=rng.integers(0,256,(h,w,3),dtype=np.uint8)
  if kind=='flat':a[:]=128
  if kind=='panels':a[:3]=255;a[-3:]=255;a[:,:3]=255;a[:,-3:]=255;a[:,w//2-2:w//2+2]=255
  planes=np.stack([describe_energy(a,compress_jpg(a,q)) for q in [70,75,80]])
  name=f'{kind}-{w}-{h}';source=put(cv.cvtColor(a,cv.COLOR_BGR2RGB));energy=put(planes.astype('<f4'))
  for qs in [(0,1),(.01,.99),(.1,.9),(.5,.5)]:
   result=prepare_energy(a,planes,quantiles=qs)
   row=dict(name=name+'-'+str(qs[0]),width=w,height=h,quantiles=qs,image=source,planes=energy,summary=result['energy_summary']);records.append(row)
   for key in ['energy_low_score','energy_high_score','energy_scope']:row[key]=put(result[key].astype('<i4' if key.endswith('scope') else '<f4'))
compressed=gzip.compress(payload,compresslevel=9,mtime=0);file='preparation.bin.gz';(out/file).write_bytes(compressed)
sha=lambda data:hashlib.sha256(data).hexdigest()
native={name:sha((root.parent/'source/gui/sherloq_app/core'/name).read_bytes()) for name in ['ela_energy.py','auto_zones.py','jpeg.py']}
report=dict(schema=1,scope='Generated RGB images; original native JPEG recompression at qualities70/75/80 then energy preparation only. No final-mask or detector claim.',seed=280005,opencv=cv.__version__,numpy=np.__version__,native=native,payload=dict(file=file,bytes=len(payload),compressedBytes=len(compressed),sha256=sha(payload),compressedSha256=sha(compressed)),cases=records)
(out/'preparation.json').write_text(json.dumps(report,indent=2)+'\n');print(len(records),'cases,',len(compressed),'compressed bytes')
