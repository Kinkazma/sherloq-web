"""Extend generated evaluator probes with native one/eight-thread boundaries.
Run generate-d2prl-evaluator-study.py first. No checkpoints or private images.
"""
from pathlib import Path
import sys,json,hashlib
import torch,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime
runtime()
from sherloq_clone_models.d2prl.deep_PM import Evaluate_ZM,Evaluate_CNN
assert torch.__version__.split('+')[0]=='2.8.0'
out=root/'.build/d2prl-evaluator-corpus';reference=json.loads((out/'reference.json').read_text());reference['threads']=2
base=list(reference['records']);extra=[]
for threads in [1,8]:
 torch.set_num_threads(threads)
 for row in base:
  if not(row['side'] in [3,7,33,65,448] and row['candidates']>1 and row['pattern'] in ['flat','tiny','noise']):continue
  inputs={key:torch.from_numpy(np.fromfile(out/value['file'],dtype=value['dtype']).reshape(value['shape'])) for key,value in row['inputs'].items()};side=row['side'];y,x=np.indices((side,side))
  model=(Evaluate_ZM if row['kind']=='zernike' else Evaluate_CNN)(torch.from_numpy(x.astype(np.float32)[None,None]),torch.from_numpy(y.astype(np.float32)[None,None])).eval()
  with torch.inference_mode():results=model(inputs['features'],inputs['offset_x'],inputs['offset_y'])
  item={**row,'name':row['name']+'-threads'+str(threads),'referenceThreads':threads,'outputs':{}}
  for key,value in zip(['x','y'],results):
   a=value.numpy();file=item['name']+'-'+key+'.bin';a.tofile(out/file);item['outputs'][key]=dict(file=file,dtype=str(a.dtype),shape=list(a.shape),bytes=a.nbytes,sha256=hashlib.sha256((out/file).read_bytes()).hexdigest())
  extra.append(item);print(item['name'],flush=True)
reference['records']=base+extra;reference['threadCounts']=[1,2,8]
(out/'thread-reference.json').write_text(json.dumps(reference,indent=2)+'\n');print(json.dumps(dict(original=len(base),extra=len(extra),total=len(reference['records']))))
