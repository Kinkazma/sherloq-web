"""Capture native CPU uniform draw identity, including post-constructor state.
No checkpoint, training, model export, private image or network is used.
"""
from pathlib import Path
import sys,json,struct,hashlib,gc
import torch,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import runtime,ROOT,verified
runtime()
from sherloq_clone_models.d2prl.models_D2PRL import DPM
assert torch.__version__.split('+')[0]=='2.8.0'
torch.set_num_threads(8)
def state():
 b=torch.get_rng_state().numpy().tobytes();assert len(b)==5056
 seed,left,seeded,next=struct.unpack_from('<QiiQ',b);assert seeded==1
 words=list(struct.unpack_from('<624Q',b,24));assert all(v<=0xffffffff for v in words)
 return dict(state=words,left=left,next=next)
def draw(label,count):
 a=torch.rand(count,dtype=torch.float32).numpy();return dict(label=label,count=count,sha256=hashlib.sha256(a.tobytes()).hexdigest())
records=[]
with torch.random.fork_rng(devices=[]):
 for seed in [0,1,22,4294967295]:
  for skip in [0,1,623,624,625,1999]:
   torch.manual_seed(seed);torch.rand(skip);initial=state();record=dict(seed=seed,skip=skip,initial=initial,draws=[draw('stream',4096)],final=state());records.append(record)
 assets=ROOT/'third_party/research/clone_detectors/01_d2prl';signatures={}
 for name in ['ZM_polar_k13.mat','VV_mvf7.mat','VV_mvf9.mat','VV_mvf11.mat']:
  _,sha=verified(assets/name);signatures[name]=sha
 torch.manual_seed(22);model=DPM(448,1,40,assets);initial=state();del model;gc.collect()
 n=448*448;draws=[draw('initial/'+axis,n) for axis in ['zm/x','zm/y','cnn/x','cnn/y']]
 for iteration in range(40):
  draws += [draw(str(iteration)+'/random/'+branch,2*n) for branch in ['zm','cnn']]
  if iteration<39:draws += [draw(str(iteration)+'/nonlocal/'+axis,n) for axis in ['zm/x','zm/y','cnn/x','cnn/y']]
 model_record=dict(seed=22,side=448,iterations=40,initial=initial,draws=draws,final=state(),constructionAssets=signatures)
files=['models_D2PRL.py','deep_PM.py','scse.py','senet.py'];native={name:hashlib.sha256((ROOT/'integration/clone_detectors/sherloq_clone_models/d2prl'/name).read_bytes()).hexdigest() for name in files}
out=root/'fixtures/d2prl';out.mkdir(exist_ok=True);report=dict(schema=1,scope='Native CPU uniform generator and ordered full40-iteration draw schedule, not actual PatchMatch evaluation',torch=torch.__version__,numpy=np.__version__,native=native,records=records,model=model_record)
(out/'random.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(states=len(records)+1,modelDrawCalls=len(draws),modelValues=sum(d['count'] for d in draws))))
