"""DLF arithmetic reference using verified local weights; payload stays private."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
assert torch.__version__.split('+')[0]=='2.8.0';torch.set_num_threads(8);loaded=load('cpu');model=loaded['model'];out=root/'.build/d2prl-dlf';out.mkdir(exist_ok=True)
ref=json.loads((root/'.build/d2prl-model/reference.json').read_text());records=[];rng=np.random.default_rng(290071)
def save(name,a):
 a=np.ascontiguousarray(a,dtype='<f4');data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,bytes=len(data),shape=list(a.shape),sha256=hashlib.sha256(data).hexdigest())
y,x=np.indices((448,448));inputs=[]
for pattern in ['native-zm','native-cnn','plane','constant','noise','diagonal']:
 if pattern.startswith('native'):
  start=4 if pattern=='native-zm' else 6;a=np.stack([np.fromfile(root/'.build/d2prl-model'/e['file'],np.float32).reshape(448,448) for e in ref['patchmatch'][start:start+2]])
 elif pattern=='plane':a=np.stack([x,y]).astype(np.float32)
 elif pattern=='constant':a=np.full((2,448,448),177.125,np.float32)
 elif pattern=='noise':a=rng.uniform(-448,448,(2,448,448)).astype(np.float32)
 else:a=np.stack([(x-y)*.75,(x+y)*1.125]).astype(np.float32)
 entry=save(pattern+'-coordinates',a);inputs.append((pattern,a,entry))
for size in [7,9,11]:
 layer=getattr(model,'DLFerror'+str(size));weights=np.stack([getattr(layer,'VV_'+str(i)).detach().numpy().reshape(size,size) for i in [1,2,3,4]]);assert all(float(getattr(layer,'bias_'+str(i))[0])==0 for i in [1,2,3,4]);weight=save('weights-'+str(size),weights)
 for pattern,a,entry in inputs:
  with torch.inference_mode():errors=layer(torch.from_numpy(a[None]));scores=2*torch.sigmoid(1/(errors+1e-10))-1
  name=str(size)+'-'+pattern;records.append(dict(name=name,side=448,kernel=size,input=entry,weights=weight,errors=save(name+'-errors',errors.numpy()),scores=save(name+'-scores',scores.numpy())))
report=dict(schema=1,scope='DLF7/9/11 ordered arithmetic on six synthetic coordinate inputs, weights remain outside delivery',torch=torch.__version__,referenceThreads=8,checkpointSha256='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',records=records);(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Generated',len(records),'DLF cases')
