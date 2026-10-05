"""Complete CAT-Net v2 from the native strict loader and stored JPEG DCT."""
from pathlib import Path
import sys,json,hashlib,argparse,importlib.util
import numpy as np
import torch,onnx
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core import catnet
out=root/'.build/catnet';out.mkdir(parents=True,exist_ok=True);torch.set_num_threads(2)
model=catnet.load('cpu');model.memory_bounded=False
class Network(torch.nn.Module):
 def __init__(self):super().__init__();self.model=model
 def forward(self,image,table):
  logits=self.model(image,table);prob=torch.softmax(logits[0],dim=0)[1]
  full=torch.nn.functional.interpolate(prob[None,None],size=image.shape[-2:],mode='bilinear',align_corners=False)[0,0]
  return prob,full
network=Network().eval();path=out/'catnet.onnx'
with torch.inference_mode():
 torch.onnx.export(network,(torch.zeros(1,24,64,96),torch.ones(1,1,8,8)),path,input_names=['image','table'],output_names=['native_map','padded_map'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={'image':{2:'h',3:'w'},'native_map':{0:'qh',1:'qw'},'padded_map':{0:'h',1:'w'}})
model.memory_dct=catnet.bounded_dct;model.memory_head=catnet.bounded_head
print('Exported graph',path.stat().st_size,flush=True);onnx.checker.check_model(str(path));cases=[]
for index,(h,w,quality,subsampling) in enumerate([(64,96,90,2),(97,131,100,0)]):
 rgb=np.random.default_rng(218+index).integers(0,256,(h,w,3),dtype=np.uint8);jpeg=out/f'case-{index}.jpg';Image.fromarray(rgb).save(jpeg,quality=quality,subsampling=subsampling)
 image,table,meta=catnet.prepare(jpeg)
 with torch.inference_mode():native,padded=network(image,table)
 files={}
 for name,value in [('image',image),('table',table),('native_map',native),('padded_map',padded)]:
  file=f'case-{index}-{name}.f32';value.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(value.shape))
 cases.append(dict(id=index,jpeg=jpeg.name,metadata=meta,files=files));print('Reference',index,meta,flush=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=dict(schema=1,memoryBounded=False,preferredLayout='NCHW',file=path.name,bytes=path.stat().st_size,sha256=sha(path),checkpointSha256=sha(root.parent/'models/external/CAT_full_v2.pth.tar'),cases=cases)
(out/'reference.json').write_text(json.dumps(record,separators=(',',':'))+'\n')
