"""Small native adaptive-control fixtures, no model inference or shared writes."""
from pathlib import Path
import json,sys,hashlib
import numpy as np,torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.vendor.lightglue.lightglue import LightGlue
model=LightGlue(features=None,input_dim=128,add_scale_ori=True,flash=False,depth_confidence=.9,width_confidence=.9)
rng=np.random.default_rng(94032);cases=[]
for layer in range(8):
 threshold=float(model.confidence_thresholds[layer])
 for label in ['boundaries','stop','pruned-total']:
  c0=np.array([threshold,np.nextafter(np.float32(threshold),np.float32(0)),1.,1.],np.float32)
  c1=np.array([threshold,np.nextafter(np.float32(threshold),np.float32(1)),1.],np.float32)
  if label=='stop':c0[:]=1;c1[:]=1
  s0=np.array([.05,.05,.1,np.nextafter(np.float32(.1),np.float32(1))],np.float32)
  s1=np.array([.05,.1,.11],np.float32)
  total=100 if label=='pruned-total' else len(c0)+len(c1)
  stop=bool(model.check_if_stop(torch.from_numpy(c0)[None],torch.from_numpy(c1)[None],layer,total))
  keep=[]
  for c,s in [(c0,s0),(c1,s1)]:
   keep.append(list(range(len(c))) if stop else torch.where(model.get_pruning_mask(torch.from_numpy(c)[None],torch.from_numpy(s)[None],layer))[1].tolist())
  cases.append(dict(layer=layer,totalPoints=total,confidence0=c0.tolist(),confidence1=c1.tolist(),matchability0=s0.tolist(),matchability1=s1.tolist(),threshold=threshold,stop=stop,keep0=keep[0],keep1=keep[1]))
source=root.parent/'source/gui/sherloq_app/vendor/lightglue/lightglue.py'
(root/'tests/data/forgeryscope/lightglue-control.json').write_text(json.dumps(dict(scope='adaptive control decisions only',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
print(len(cases),'native adaptive-control cases')
