"""Native zone composition oracle for session tests, without neural inference."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
out=root/'.build/d2prl-analysis';out.mkdir(exist_ok=True)
def save(name,a):
 a=np.ascontiguousarray(a);b=a.tobytes();p=out/(name+'.bin');p.write_bytes(b);return dict(file=p.name,shape=list(a.shape),dtype=str(a.dtype),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
y,x,c=np.indices((137,173,3));image=((19*x+31*y+37*c)%256).astype(np.uint8)
zones=[dict(id='roi-a',kind='region',bounds=[7,9,81,101],rawIndex=1),dict(id='roi-b',kind='region',bounds=[63,41,161,129],rawIndex=2),dict(id='envelope',kind='envelope',bounds=[0,0,173,137],rawIndex=0)]
raws=[np.fromfile(root/f'.build/d2prl-zones/raw-{i}.bin',np.float32).reshape(3,448,448) for i in range(3)]
for z in zones:
 x0,y0,x1,y1=z['bounds'];z['crop']=save(z['id']+'-rgb',image[y0:y1,x0:x1]);z['raw']=save(z['id']+'-raw',raws[z.pop('rawIndex')])
exclusions=[[71,61,119,119],[0,0,8,137]];records=[]
for envelope in [False,True]:
 selected=zones if envelope else zones[:2]
 for minimum in [0,17,500,5000]:
  arrays={name:np.zeros((137,173),np.uint8 if name in ('mask','analyzed') else np.float32) for name in ('map','mask','target','source','analyzed')}
  for z in selected:
   x0,y0,x1,y1=z['bounds'];raw=np.fromfile(out/z['raw']['file'],np.float32).reshape(3,448,448);masks=postprocess(raw,minimum)
   for name,a in zip(('map','mask','target','source'),[raw[0],*masks]):
    area=arrays[name][y0:y1,x0:x1];np.maximum(area,cv.resize(a,(x1-x0,y1-y0),interpolation=cv.INTER_LINEAR if name=='map' else cv.INTER_NEAREST),out=area)
   arrays['analyzed'][y0:y1,x0:x1]=1
  for x0,y0,x1,y1 in exclusions:
   for a in arrays.values():a[y0:y1,x0:x1]=0
  name=('envelope' if envelope else 'regions')+'-'+str(minimum);records.append(dict(name=name,envelope=envelope,minimum=minimum,outputs={k:save(name+'-'+k,v) for k,v in arrays.items()}))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Session/crop/cache/refilter oracle with explicit synthetic neural-grid fixtures; no model inference or neural parity claim.',source=save('source-rgb',image),width=173,height=137,zones=zones,exclusions=exclusions,records=records),indent=2)+'\n')
print('Generated',len(records),'native session-composition cases')
