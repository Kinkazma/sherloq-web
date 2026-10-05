"""Native full-iteration PatchMatch on generated descriptors, no learned model."""
from pathlib import Path
import sys,json,struct,hashlib,time
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime
runtime()
from sherloq_clone_models.d2prl.deep_PM import PatchMatch
assert torch.__version__.split('+')[0]=='2.8.0';torch.set_num_threads(8)
out=root/'.build/d2prl-patchmatch';out.mkdir(exist_ok=True);rng=np.random.default_rng(290041);records=[]
initial=json.loads((root/'fixtures/d2prl/random.json').read_text())['model']['initial']
def set_state(s):
 b=bytearray(torch.get_rng_state().numpy().tobytes());struct.pack_into('<QiiQ',b,0,22,s['left'],1,s['next']);struct.pack_into('<624Q',b,24,*s['state']);torch.set_rng_state(torch.from_numpy(np.frombuffer(b,dtype=np.uint8).copy()))
def state():
 b=torch.get_rng_state().numpy().tobytes();_,left,_,nxt=struct.unpack_from('<QiiQ',b);return dict(state=list(struct.unpack_from('<624Q',b,24)),left=left,next=nxt)
def save(name,tensor):
 a=tensor.numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,dtype=str(a.dtype),shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
shapes=[(2,40,'flat'),(3,40,'noise'),(7,40,'steps'),(17,40,'noise'),(32,40,'signed'),(33,2,'noise'),(65,1,'noise')]
if '--full' in sys.argv:shapes=[(448,40,'noise')]
for side,iterations,pattern in shapes:
 name=f'{side}-{iterations}-{pattern}';model=PatchMatch(iterations,50,side,1).eval();features=[]
 for channels in [36,96,96]:
  shape=(1,channels,side,side)
  if pattern=='flat':a=np.full(shape,.25,np.float32)
  elif pattern=='steps':a=(np.arange(np.prod(shape)).reshape(shape)%17-8).astype(np.float32)/32
  elif pattern=='signed':a=rng.standard_normal(shape,dtype=np.float32)
  else:a=rng.random(shape,dtype=np.float32)
  features.append(torch.from_numpy(a).half())
 row=dict(name=name,side=side,iterations=iterations,pattern=pattern,referenceThreads=8,initial=initial,inputs=[save(name+'-features-'+str(i),v) for i,v in enumerate(features)],trace=[])
 def hook(branch):
  def call(module,args,result):
   item=dict(branch=branch,outputs=[dict(sha256=hashlib.sha256(v.numpy().tobytes()).hexdigest()) for v in result]);row['trace'].append(item)
  return call
 handles=[model.evaluate_ZM.register_forward_hook(hook('zm')),model.evaluate_CNN.register_forward_hook(hook('cnn'))]
 set_state(initial);start=time.monotonic()
 with torch.inference_mode():outputs=model(*features)
 row.update(outputs=[save(name+'-output-'+str(i),v) for i,v in enumerate(outputs)],final=state())
 for handle in handles:handle.remove()
 records.append(row);print(json.dumps(dict(name=name,calls=len(row['trace']),nativeSeconds=time.monotonic()-start)),flush=True)
report=dict(schema=1,scope='Complete PatchMatch loop on synthetic descriptors; no learned feature extraction, heads or masks',torch=torch.__version__,nativeSha256=hashlib.sha256((root.parent/'integration/clone_detectors/sherloq_clone_models/d2prl/deep_PM.py').read_bytes()).hexdigest(),records=records)
filename='full-reference.json' if '--full' in sys.argv else 'reference.json';(out/filename).write_text(json.dumps(report,indent=2)+'\n')
