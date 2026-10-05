from pathlib import Path
import json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-sigmoid';out.mkdir(exist_ok=True);torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';records=[]
def save(name,array):
 data=array.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(array.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
union=root/'.build/d2prl-union';ref=json.loads((union/'reference.json').read_text());entry=ref['records'][-1]['output'];data=(union/entry['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==entry['sha256']
rng=np.random.default_rng(290104);cases=[('union-logits',np.frombuffer(data,np.float32).copy()),('linear',np.linspace(-104,104,2**21,dtype=np.float32)),('normal',rng.standard_normal(2**21,dtype=np.float32)*np.float32(16)),('near-zero',np.arange(2**21,dtype=np.uint32).view(np.float32))]
for name,a in cases:
 with torch.inference_mode():expected=torch.sigmoid(torch.from_numpy(a)).numpy()
 records.append(dict(name=name,input=save(name+'-input',a),output=save(name+'-output',expected)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Float32 vector-domain sigmoid on generated values and native synthetic union logits; no complete union inference',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n');print('Generated',len(records),'sigmoid cases')
