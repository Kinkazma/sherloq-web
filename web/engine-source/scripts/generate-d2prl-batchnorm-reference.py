"""Native inference BatchNorm/ReLU on generated convolution boundaries."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';model=load('cpu')['model'];out=root/'.build/d2prl-batchnorm';out.mkdir(exist_ok=True);conv=root/'.build/d2prl-convolution';reference=json.loads((conv/'all-reference.json').read_text());records=[]
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
for row in reference['records']:
 if '-cnn-' not in row['name']:continue
 index=int(row['name'].split('-')[-1]);
 if index==12:continue
 layer=model.head_mask[index+1];assert isinstance(layer,torch.nn.BatchNorm2d);e=row['output'];data=(conv/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];value=torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(e['shape']));params=torch.stack([layer.running_mean,layer.running_var,layer.weight,layer.bias]);name=row['name']
 with torch.inference_mode():expected=layer(value);relu=torch.relu(expected)
 records.append(dict(name=name,epsilon=layer.eps,input={**e,'source':'convolution'},params=save(name+'-params',params),output=save(name+'-output',expected),relu=save(name+'-relu',relu)));print(name,flush=True)
report=dict(schema=1,scope='Native BatchNorm/ReLU boundaries on three synthetic D2PRL input scales; no full-model parity',torch=torch.__version__,referenceThreads=8,records=records);(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n')
