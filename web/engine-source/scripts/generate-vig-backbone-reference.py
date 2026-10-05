"""Private native backbone oracles for independent comparison after browser work."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import torch,torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/segmentation-models/mgcfdn-vig';out=root/'.build/vig-backbone-reference';out.mkdir(exist_ok=True)
ref=json.loads((base/'reference.json').read_text());torch.set_num_threads(ref['referenceThreads'])
def deny(*a,**k):raise RuntimeError('Offline native reference')
torch.hub.download_url_to_file=deny;torch.utils.model_zoo.load_url=deny
loaded=load_segmentation(ref['variant'],'cpu');assert loaded['weights']==ref['weights'];model=loaded['model'].eval();records=[]
for row in ref['records']:
 raw=(base/row['input']['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==row['input']['sha256'];x=torch.from_numpy(np.frombuffer(raw,np.float32).copy().reshape(row['input']['shape']));captures=[]
 handle=model.visual_feature_extractor.register_forward_hook(lambda m,a,y:captures.append(y.detach().numpy().copy()))
 try:
  with torch.inference_mode():logits=model(x)
  assert hashlib.sha256(logits.numpy().tobytes()).hexdigest()==row['logits']['sha256']
 finally:handle.remove()
 data=captures[0].tobytes();name=row['name']+'-features.bin';(out/name).write_bytes(data);records.append(dict(name=row['name'],file=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),shape=list(captures[0].shape)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,weights=ref['weights'],records=records),indent=2)+'\n');print('Native VIG features captured independently')
