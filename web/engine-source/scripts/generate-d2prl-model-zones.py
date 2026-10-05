"""Real independent native ROI inferences plus the already verified envelope.
No training, downloads, private photos or reference activation injection.
"""
from pathlib import Path
import sys,json,hashlib,time
import numpy as np
import cv2 as cv
import torch,torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load,predict,postprocess
out=root/'.build/d2prl-model-zones';out.mkdir(exist_ok=True)
def denied(*a,**k):raise RuntimeError('Offline model reference')
torch.hub.download_url_to_file=denied;torch.utils.model_zoo.load_url=denied;torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0'
def save(name,a):
 a=np.ascontiguousarray(a);b=a.tobytes();p=out/(name+'.bin');p.write_bytes(b);return dict(file=p.name,shape=list(a.shape),dtype=str(a.dtype),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
foundation=json.loads((root/'.build/d2prl-model/reference.json').read_text());source=np.fromfile(root/'.build/d2prl-model'/foundation['source']['file'],np.uint8).reshape(foundation['source']['shape']);h,w=source.shape[:2]
zones=[dict(id='roi-a',kind='region',bounds=[17,23,303,283]),dict(id='roi-b',kind='region',bounds=[149,91,497,373]),dict(id='envelope',kind='envelope',bounds=[0,0,w,h])]
loaded=load('cpu');raws=[]
for zone in zones:
 name=zone['id'];x0,y0,x1,y1=zone['bounds'];started=time.monotonic()
 if name=='envelope':raw=np.stack([np.fromfile(root/'.build/d2prl-model'/s['file'],np.float32).reshape(448,448) for s in foundation['raw']])
 else:
  def progress(i,total):
   if i%20==0:print(name,i,total,flush=True)
  raw=predict(cv.cvtColor(source[y0:y1,x0:x1],cv.COLOR_RGB2BGR),loaded,progress)['raw']
 zone['raw']=save(name+'-raw',raw);raws.append(raw);print(name,'reference complete',round(time.monotonic()-started,2),flush=True)
exclusions=[[201,157,251,217],[0,0,8,h]];records=[]
for envelope in [False,True]:
 selected=zones if envelope else zones[:2]
 for minimum in [0,17,500,5000]:
  arrays={name:np.zeros((h,w),np.uint8 if name in ('mask','analyzed') else np.float32) for name in ('map','mask','target','source','analyzed')}
  for zone,raw in zip(selected,raws):
   x0,y0,x1,y1=zone['bounds'];masks=postprocess(raw,minimum)
   for name,a in zip(('map','mask','target','source'),[raw[0],*masks]):
    area=arrays[name][y0:y1,x0:x1];np.maximum(area,cv.resize(a,(x1-x0,y1-y0),interpolation=cv.INTER_LINEAR if name=='map' else cv.INTER_NEAREST),out=area)
   arrays['analyzed'][y0:y1,x0:x1]=1
  for x0,y0,x1,y1 in exclusions:
   for a in arrays.values():a[y0:y1,x0:x1]=0
  name=('envelope' if envelope else 'regions')+'-'+str(minimum);records.append(dict(name=name,envelope=envelope,minimum=minimum,outputs={k:save(name+'-'+k,v) for k,v in arrays.items()}))
original=np.fromfile(root/'.build/d2prl-source/source.png',np.uint8)
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Generated original PNG, two independent original-pixel ROI model inferences and complete-image envelope. Native448/40/seed22 at four per-grid component minima; exclusions applied after projection. Existing verified whole-image raw reused as reference only.',torch=torch.__version__,referenceThreads=8,checkpointSha256='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',width=w,height=h,source=save('source-rgb',source),original=save('source-png',original),zones=zones,exclusions=exclusions,records=records),indent=2)+'\n')
print('Generated real ROI model references',flush=True)
