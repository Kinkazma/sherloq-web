"""Native refilter and source-coordinate composition on independent cached grids."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import refilter
out=root/'.build/d2prl-zones';out.mkdir(exist_ok=True);rng=np.random.default_rng(109931);y,x=np.indices((448,448));raws=[]
for i in range(3):
 union=((x//17+y//23+i)%3!=0).astype(np.float32);union[::17,::13]=.5;target=((x+i*37)%71<33).astype(np.float32)*1e-7;source=((y+i*19)%53<27).astype(np.float32)*1e-7
 if i==1:target=(rng.random((448,448))>.55).astype(np.float32)*1e-7;source=(rng.random((448,448))>.55).astype(np.float32)*1e-7
 if i==2:union[30:53,50:71]=1;target[230:]=0;source[:80]=0
 raws.append(np.stack([union,target,source]))
def save(name,a):
 a=np.ascontiguousarray(a);b=a.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,shape=list(a.shape),dtype=str(a.dtype),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
raw_records=[save('raw-'+str(i),r) for i,r in enumerate(raws)];records=[]
scenarios=[(137,173,[[0,0,173,137]],[]),(137,173,[[7,9,81,101],[63,41,161,129]],[]),(137,173,[[3,5,57,73],[99,61,171,135]],[[7,9,27,33]]),(137,173,[[7,9,81,101],[63,41,161,129]],[[71,61,119,119],[0,0,8,137]]),(137,173,[[0,0,173,137]],[[0,0,173,137]]),(31,47,[[1,2,9,10],[13,7,46,30]],[]),(521,389,[[13,19,207,499],[105,151,379,519]],[[113,233,231,407]])]
scenarios.append((2,3,[[0,0,3,2]],[]))
for index,(h,w,boxes,excluded) in enumerate(scenarios):
 selected=[raws[(i+index)%3] for i in range(len(boxes))];allowed=np.ones((h,w),np.uint8);analyzed=np.zeros((h,w),np.uint8);score=np.zeros((h,w),np.float32)
 for raw,(x0,y0,x1,y1) in zip(selected,boxes):analyzed[y0:y1,x0:x1]=1;np.maximum(score[y0:y1,x0:x1],cv.resize(raw[0],(x1-x0,y1-y0),interpolation=cv.INTER_LINEAR),out=score[y0:y1,x0:x1])
 for x0,y0,x1,y1 in excluded:allowed[y0:y1,x0:x1]=0
 analyzed*=allowed;score*=allowed
 initial=dict(raw_probabilities=selected,map=score,mask=np.zeros((h,w),np.uint8),target=np.zeros((h,w),np.float32),source=np.zeros((h,w),np.float32),analyzed=analyzed,metadata=dict(boxes=boxes,zones=[{} for _ in boxes]))
 for minimum in [0,17,500,5000]:
  result=refilter((initial,minimum));prefix=f'{index}-{minimum}';records.append(dict(name=prefix,width=w,height=h,minimum=minimum,mode='whole-image' if index==7 else 'regions',zones=[dict(id='zone-'+str(i),bounds=box,raw=raw_records[(i+index)%3]) for i,box in enumerate(boxes)],exclusions=excluded,outputs={name:save(prefix+'-'+name,result[name]) for name in ['map','mask','target','source','analyzed']},status=result['metadata']['status'],zoneStatuses=[z['status'] for z in result['metadata']['zones']]))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native refilter on independent cached448grids; overlaps, exclusions, disjoint regions and component minimums. No neural inference required or claimed.',nativeSourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/d2prl.py').read_bytes()).hexdigest(),records=records),indent=2)+'\n');print('Generated',len(records),'zone cases')
