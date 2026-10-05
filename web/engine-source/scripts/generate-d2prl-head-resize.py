"""Capture native interpolation boundaries without editing the native model.
Derived tensors stay private; the inputs are the existing generated RGB case.
"""
from pathlib import Path
import sys,json,hashlib,importlib.util
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';loaded=load('cpu')
spec=importlib.util.spec_from_file_location('blocks',root/'experiments/d2prl/model-blocks.py');blocks=importlib.util.module_from_spec(spec);spec.loader.exec_module(blocks)
base=root/'.build/d2prl-model';out=root/'.build/d2prl-head-resize';out.mkdir(exist_ok=True);ref=json.loads((base/'reference.json').read_text());records=[]
def read(entry):
 data=(base/entry['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==entry['sha256'];return torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(entry['shape']))
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
original=torch.nn.functional.interpolate
def capture(input,*args,**kwargs):
 output=original(input,*args,**kwargs)
 if kwargs.get('mode')=='bilinear':
  assert kwargs.get('align_corners') is True and input.dtype==torch.float32
  name='head-resize-'+str(len(records));records.append(dict(name=name,channels=input.shape[1],height=input.shape[2],width=input.shape[3],outHeight=output.shape[2],outWidth=output.shape[3],input=save(name+'-input',input),output=save(name+'-output',output)));print(name,list(input.shape),list(output.shape),flush=True)
 return output
torch.nn.functional.interpolate=capture
try:
 with torch.inference_mode():raw=blocks.Heads(loaded['model']).eval()(read(ref['input']),*[read(e) for e in ref['patchmatch']])
 for a,e in zip(raw,ref['raw']):assert np.array_equal(a.numpy().view(np.uint32),read(e).numpy().view(np.uint32))
finally:torch.nn.functional.interpolate=original
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native head interpolation boundaries on generated RGB448 source with native PatchMatch; not browser inference',torch=torch.__version__,referenceThreads=8,records=records),indent=2)+'\n')
