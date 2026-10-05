"""Native source-space interpolation corpus, including actual model grids."""
from pathlib import Path
import json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-spatial';out.mkdir(exist_ok=True);rng=np.random.default_rng(204752);records=[]
def save(name,a):
 b=a.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,shape=list(a.shape),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
for ih,iw in [(1,1),(1,7),(7,1),(2,3),(17,31),(448,448)]:
 source=rng.random((ih,iw),dtype=np.float32);source.flat[:min(4,source.size)]=np.array([0.,.5,1.,np.nextafter(np.float32(.5),np.float32(1))])[:min(4,source.size)];source[0,0]=np.float32(.37);inp=save(f'source-{ih}x{iw}',source)
 for oh,ow in [(1,1),(1,29),(31,1),(11,7),(389,521),(448,448),(224,224),(607,809)]:
  for nearest in [0,1]:
   a=cv.resize(source,(ow,oh),interpolation=cv.INTER_NEAREST if nearest else cv.INTER_LINEAR);name=f'{ih}x{iw}-to-{oh}x{ow}-{nearest}';records.append(dict(name=name,nearest=nearest,input=inp,output=save(name,a)))
base=root/'.build/d2prl-model';ref=json.loads((base/'reference.json').read_text());maskref=json.loads((base/'masks-reference.json').read_text());source=np.fromfile(base/ref['raw'][0]['file'],np.float32).reshape(448,448);masks=np.fromfile(base/maskref['records'][2]['file'],np.float32).reshape(3,448,448)
for i,(a,nearest) in enumerate([(source,0),*[(m,1) for m in masks]]):
 name='model-'+str(i);records.append(dict(name=name,nearest=nearest,input=save(name+'-input',a),output=save(name+'-output',cv.resize(a,(521,389),interpolation=cv.INTER_NEAREST if nearest else cv.INTER_LINEAR))))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='OpenCV4.11 continuous bilinear score and nearest masks back to source dimensions; no neural inference',opencv=cv.__version__,records=records),indent=2)+'\n');print('Generated',len(records),'spatial cases')
