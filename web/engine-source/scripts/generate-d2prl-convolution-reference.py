"""Capture finite convolution boundaries using verified local D2PRL weights.
Generated input/intermediate/parameter payloads remain private in .build.
"""
from pathlib import Path
import sys,json,hashlib,argparse
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
parser=argparse.ArgumentParser();parser.add_argument('--all-scales',action='store_true');args=parser.parse_args();torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';loaded=load('cpu');model=loaded['model'];out=root/'.build/d2prl-convolution';out.mkdir(exist_ok=True)
ref=json.loads((root/'.build/d2prl-model/reference.json').read_text());entry=ref['input'];data=(root/'.build/d2prl-model'/entry['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==entry['sha256'];image=torch.from_numpy(np.frombuffer(data,np.float32).copy().reshape(entry['shape']));records=[]
def save(name,tensor):
 a=tensor.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
def record(name,source,weight,bias,result,padding):
 records.append(dict(name=name,padding=padding,input=save(name+'-input',source),weights=save(name+'-weights',weight),bias=save(name+'-bias',bias),output=save(name+'-output',result)));print(name,flush=True)
for side in ([448,298,597] if args.all_scales else [448]):
 with torch.inference_mode():
  x=image if side==448 else torch.nn.functional.interpolate(image,size=(side,side),mode='bilinear',align_corners=True)
  handles=[]
  for index,layer in enumerate(model.head_mask):
   if isinstance(layer,torch.nn.Conv2d):
    def hook(layer,args,result,index=index):record(f'{side}-cnn-{index}',args[0],layer.weight,layer.bias,result,0)
    handles.append(layer.register_forward_hook(hook))
  model.head_mask(torch.nn.functional.pad(x,[7]*4,mode='reflect'))
  for handle in handles:handle.remove()
  for part in ['real','imag']:
   weight=getattr(model.ZM_conv,part+'_weight');bias=getattr(model.ZM_conv,part+'_bias');result=torch.nn.functional.conv2d(x,weight,bias,padding=6);record(f'{side}-zm-{part}',x,weight,bias,result,6)
report=dict(schema=1,scope='Synthetic source, native convolution boundaries from verified D2PRL model; not full feature/model inference',torch=torch.__version__,referenceThreads=8,checkpointSha256='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',records=records);(out/('all-reference.json' if args.all_scales else 'reference.json')).write_text(json.dumps(report,indent=2)+'\n')
