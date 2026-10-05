"""Generated D2PRL evaluator corpus, no checkpoint or user images.
Requires the pinned native adapter/PyTorch 2.8.0; outputs stay in .build.
These evaluator units do not validate model inference or final masks.
"""
from pathlib import Path
import sys, json, hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime
runtime()
from sherloq_clone_models.d2prl.deep_PM import Evaluate_ZM, Evaluate_CNN
assert torch.__version__.split('+')[0]=='2.8.0'
torch.set_num_threads(2)
out=root/'.build/d2prl-evaluator-corpus';out.mkdir(exist_ok=True)
rng=np.random.default_rng(280008);records=[]
patterns=['flat','noise','signed','tiny','wide','steps','fences']
def make(kind,side,k,pattern):
 channels=36 if kind=='zernike' else 96;shape=(1,channels,side,side)
 if pattern=='flat':a=np.full(shape,.25,np.float32)
 elif pattern=='noise':a=rng.random(shape,dtype=np.float32)
 elif pattern in ['signed','tiny','wide']:
  scale={'signed':1,'tiny':2**-16,'wide':16}[pattern];a=rng.standard_normal(shape,dtype=np.float32)*scale
 elif pattern=='steps':a=(np.arange(np.prod(shape),dtype=np.int32).reshape(shape)%31-15).astype(np.float32)/16
 else:a=np.array([0,2**-24,2**-14,1,1+2**-10,-1,-1-2**-10,.5],np.float32)[rng.integers(0,8,shape)]
 features=torch.from_numpy(a).half();oshape=(1,k,side,side)
 ox=torch.from_numpy(rng.uniform(-2*side,2*side,oshape).astype(np.float32));oy=torch.from_numpy(rng.uniform(-2*side,2*side,oshape).astype(np.float32))
 # Exercise exact integer coordinates and clamp boundaries alongside fractions.
 ox.numpy().ravel()[::7]=0;oy.numpy().ravel()[::11]=0
 y,x=np.indices((side,side));model=(Evaluate_ZM if kind=='zernike' else Evaluate_CNN)(torch.from_numpy(x.astype(np.float32)[None,None]),torch.from_numpy(y.astype(np.float32)[None,None])).eval()
 with torch.inference_mode():rx,ry=model(features,ox,oy)
 name=f'{kind}-{side}-{k}-{pattern}';row=dict(name=name,kind=kind,side=side,candidates=k,pattern=pattern,inputs={},outputs={})
 for key,tensor in [('features',features),('offset_x',ox),('offset_y',oy),('x',rx),('y',ry)]:
  data=tensor.numpy();file=name+'-'+key+'.bin';data.tofile(out/file)
  row['inputs' if key in ['features','offset_x','offset_y'] else 'outputs'][key]=dict(file=file,dtype=str(data.dtype),shape=list(data.shape),bytes=data.nbytes,sha256=hashlib.sha256((out/file).read_bytes()).hexdigest())
 records.append(row);print(name,flush=True)
for kind in ['zernike','cnn']:
 for si,side in enumerate([2,3,7,17,32,33,64,65]):
  for pi,pattern in enumerate(patterns):make(kind,side,[1,5,13][(si+pi)%3],pattern)
 for k in [5,13]:make(kind,448,k,'noise')
source=root.parent/'integration/clone_detectors/sherloq_clone_models/d2prl/deep_PM.py'
ops=root.parent/'source/gui/sherloq_app/core/d2prl_ops.py'
report=dict(schema=1,scope='Generated CPU evaluator units, no model/checkpoint, no final detections',seed=280008,torch=torch.__version__,numpy=np.__version__,nativeSha256=hashlib.sha256(source.read_bytes()).hexdigest(),samplerSha256=hashlib.sha256(ops.read_bytes()).hexdigest(),records=records)
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Completed',len(records),'cases')
