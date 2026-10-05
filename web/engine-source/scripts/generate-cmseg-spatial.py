"""Native512 projection extension, separate from unchanged D2PRL fixtures."""
from pathlib import Path
import json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];out=root/'.build/cmseg-spatial';out.mkdir(exist_ok=True)
records=[]
def save(name,array):
    data=np.ascontiguousarray(array).tobytes();file=name+'.bin';(out/file).write_bytes(data)
    return dict(file=file,shape=list(array.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
source=np.random.default_rng(512448).random((512,512),dtype=np.float32)
source.flat[:4]=[0,.5,1,np.nextafter(np.float32(.5),np.float32(1))]
spec=save('generated512',source)
for h,w in [(1,1),(31,1),(1,29),(11,7),(256,256),(512,512),(389,521),(607,809)]:
    for nearest in [0,1]:
        name=str(h)+'x'+str(w)+'-'+str(nearest)
        records.append(dict(name=name,nearest=nearest,input=spec,output=save(name,cv.resize(source,(w,h),interpolation=cv.INTER_NEAREST if nearest else cv.INTER_LINEAR))))
base=root/'.build/segmentation-models/cmseg-generalization'
ref=json.loads((base/'split-reference.json').read_text());row=next(r for r in ref['records'] if r['name']=='blobs-copy')
p=np.fromfile(base/row['probability']['file'],np.float32).reshape(512,512)
for value,nearest,name in [(p,0,'actual-score'),((p>.5).astype(np.float32),1,'actual-mask')]:
    records.append(dict(name=name,nearest=nearest,input=save(name+'-input',value),output=save(name+'-output',cv.resize(value,(521,389),interpolation=cv.INTER_NEAREST if nearest else cv.INTER_LINEAR))))
(out/'reference.json').write_text(json.dumps(dict(schema=1,opencv=cv.__version__,records=records),indent=2)+'\n')
print('Generated',len(records),'native512 projection cases')
