"""Native-grid projection/union/exclusion reference; no inference performed."""
from pathlib import Path
import json,hashlib,sys
import cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import refilter
cv.setNumThreads(1);out=root/'.build/neural-composition';out.mkdir(exist_ok=True);records=[];w,h=1027,1021;boxes=[[0,0,721,817],[311,191,w,h]]
for name,family,dirname,side,kind in [('d2prl','d2prl','d2prl-zones',448,None),('mgcf-st','segmentation','segmentation-zones-mgcfdn-st',256,'softmax'),('cmseg','segmentation','segmentation-zones-cmseg-generalization',512,'sigmoid')]:
 base=root/'.build'/dirname;raws=[np.fromfile(base/f'raw-{i}.bin',np.float32).reshape(3 if family=='d2prl' or kind=='softmax' else 1,side,side) for i in range(2)]
 roles=family=='d2prl' or kind=='softmax';arrays={key:np.zeros((h,w),np.float32 if key in ['map','target','source'] else np.uint8) for key in ['map','mask','analyzed','candidates']+(['target','source'] if roles else [])};statuses=[]
 for raw,(x0,y0,x1,y1) in zip(raws,boxes):
  arrays['analyzed'][y0:y1,x0:x1]=1
  values={'map':raw[0] if kind!='softmax' else raw[0]+raw[1]}
  if family!='d2prl':
   values['mask']=((raw[0]>=.5)|(raw[1]>=.5)).astype(np.uint8) if roles else (raw[0]>.5).astype(np.uint8)
   if roles:values.update(target=raw[0],source=raw[1])
  for key,grid in values.items():
   scaled=cv.resize(grid,(x1-x0,y1-y0),interpolation=cv.INTER_NEAREST if key=='mask' else cv.INTER_LINEAR);np.maximum(arrays[key][y0:y1,x0:x1],scaled,out=arrays[key][y0:y1,x0:x1])
   if key=='mask':statuses.append('ok' if np.any(scaled) else 'empty')
 excluded=[[400,250,611,710],[0,0,8,h]] if family=='d2prl' else []
 if family=='d2prl':
  for x0,y0,x1,y1 in excluded:
   arrays['map'][y0:y1,x0:x1]=0;arrays['analyzed'][y0:y1,x0:x1]=0
  value=refilter((dict(raw_probabilities=raws,**arrays,metadata=dict(boxes=boxes,zones=[{} for _ in boxes])),17));arrays.update({key:value[key] for key in ['map','mask','target','source','analyzed']});statuses=[z['status'] for z in value['metadata']['zones']]
 outputs={key:dict(dtype=str(a.dtype),shape=list(a.shape),sha256=hashlib.sha256(a.tobytes()).hexdigest()) for key,a in arrays.items()}
 records.append(dict(name=name,family=family,width=w,height=h,side=side,kind=kind,minimum=17,mode='regions',exclusions=excluded,zones=[dict(id=f'zone-{i}',bounds=b,raw=dict(file=f'.build/{dirname}/raw-{i}.bin',sha256=hashlib.sha256(raws[i].tobytes()).hexdigest())) for i,b in enumerate(boxes)],outputs=outputs,status='ok' if np.any(arrays['mask']) else 'empty',zoneStatuses=statuses))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native raw-grid postprocessing and source-coordinate composition only; no neural inference or image preparation in this reference.',opencv=cv.__version__,records=records),indent=2)+'\n');print('Native composition cases',len(records))
