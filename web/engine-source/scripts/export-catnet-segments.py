"""Native CAT-Net operators; spatial banks and global resize coordinates stay external."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch,onnx
from torch import nn
from torch.nn import functional as F
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core import catnet
out=root/'.build/catnet-segments';out.mkdir(exist_ok=True);torch.set_num_threads(2)
model=catnet.load('cpu').eval();model.memory_bounded=False;assets={}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def geometry(layer):
 if isinstance(layer,nn.Conv2d):return layer.dilation[0]*(layer.kernel_size[0]-1)//2,layer.stride[0]
 if type(layer).__name__ in ['BasicBlock','Bottleneck']:
  layers=[layer.conv1,layer.conv2]+([layer.conv3] if hasattr(layer,'conv3') else [])
 else:layers=list(layer.children())
 radius=0;stride=1
 for child in layers:
  r,s=geometry(child);radius+=r*stride;stride*=s
 return radius,stride
class DctStem(nn.Module):
 def __init__(self):super().__init__();self.first=model.dc_layer0_dil;self.tail=model.dc_layer1_tail;self.register_buffer('categories',torch.arange(21).float().view(1,21,1,1))
 def forward(self,x,table):
  x=self.tail(self.first((x==self.categories).float()));b,c,h,w=x.shape
  x=x.reshape(b,c,h//8,8,w//8,8).permute(0,1,3,5,2,4)
  return torch.cat((x.reshape(b,c*64,h//8,w//8),(x*table.unsqueeze(-1).unsqueeze(-1)).reshape(b,c*64,h//8,w//8)),1)
class Sample(nn.Module):
 def forward(self,x,grid):return F.grid_sample(x,grid,mode='bilinear',padding_mode='border',align_corners=False)
class Head(nn.Module):
 def __init__(self):super().__init__();self.head=model.last_layer
 def forward(self,x):return self.head(x).softmax(1)[:,1:2]
def export(name,layer,channels,extra=None,shape=(32,48),manual=None):
 layer.eval();path=out/(name+'.onnx');x=torch.zeros(1,channels,*shape);args=[x];names=['x'];dynamic={'x':{2:'h',3:'w'},'result':{2:'oh',3:'ow'}}
 if extra=='table':args.append(torch.ones(1,1,8,8));names.append('table')
 if extra=='grid':args.append(torch.zeros(1,7,13,2));names.append('grid');dynamic['grid']={1:'gh',2:'gw'};dynamic['x'][1]='channels';dynamic['result'][1]='channels'
 peaks=[channels]
 def capture(module,inputs,output):
  if isinstance(output,torch.Tensor) and output.ndim==4:peaks.append(output.numel()/(shape[0]*shape[1]))
 hooks=[m.register_forward_hook(capture) for m in layer.modules()]
 with torch.inference_mode():value=layer(*args)
 for hook in hooks:hook.remove()
 with torch.inference_mode():
  torch.onnx.export(layer,tuple(args),path,input_names=names,output_names=['result'],opset_version=19,dynamo=False,external_data=False,dynamic_axes=dynamic)
 onnx.checker.check_model(str(path));assets[name]={'file':path.name,'bytes':path.stat().st_size,'sha256':sha(path),'graphOptimizationLevel':'disabled','preferredLayout':'NCHW'}
 r,s=manual if manual else geometry(layer)
 return {'name':name,'inputChannels':channels,'channels':value.shape[1],'radius':r,'stride':s,'activationChannels':int(np.ceil(max(peaks)))}
def transition(name,layer,inputs):
 result=[]
 for i,m in enumerate(layer):
  source=min(i,len(inputs)-1)
  result.append({'source':source,'operator':None if m is None else export(f'{name}-{i}',m,inputs[source])})
 return result
def stages(name,layer):
 result=[]
 for k,m in enumerate(layer):
  channels=[b[0].conv1.in_channels for b in m.branches];branches=[export(f'{name}-{k}-branch{i}',b,channels[i]) for i,b in enumerate(m.branches)];fuse=[]
  for i,row in enumerate(m.fuse_layers):fuse.append([None if b is None else export(f'{name}-{k}-fuse{i}-{j}',b,channels[j]) for j,b in enumerate(row)])
  result.append({'branches':branches,'fuse':fuse})
 return result
record={'schema':1,'assets':assets,'checkpointSha256':sha(root.parent/'models/external/CAT_full_v2.pth.tar')}
record['rgbStem']=export('rgb-stem',nn.Sequential(model.conv1,model.bn1,model.relu,model.conv2,model.bn2,model.relu,model.layer1),3)
record['rgbTransitions']=[transition('rgb-transition1',model.transition1,[256]),transition('rgb-transition2',model.transition2,[48,96]),transition('rgb-transition3',model.transition3,[48,96,192])]
record['rgbStages']=[stages('rgb-stage2',model.stage2),stages('rgb-stage3',model.stage3),stages('rgb-stage4',model.stage4)]
record['dctStem']=export('dct-stem',DctStem(),1,'table',manual=(15,8))
record['dctLayer']=export('dct-layer',model.dc_layer2,512)
record['dctTransitions']=[transition('dct-transition2',model.dc_transition2,[96]),transition('dct-transition3',model.dc_transition3,[96,192])]
record['dctStages']=[stages('dct-stage3',model.dc_stage3),stages('dct-stage4',model.dc_stage4)]
record['fusionTransition']=transition('fusion-transition',model.transition4,[48,192,384,768]);record['fusionStage']=stages('fusion-stage5',model.stage5)
record['sample']=export('sample',Sample(),3,'grid',manual=(0,1))['name'];record['head']=export('head',Head(),360)
# Real JPEG native references exercise aligned and non-32-aligned padded shapes.
reference=json.loads((root/'.build/catnet/reference.json').read_text());cases=[]
for c in reference['cases']:
 image,table,meta=catnet.prepare(root/'.build/catnet'/c['jpeg'])
 with torch.inference_mode():native=model(image,table).softmax(1)[:,1:2];full=F.interpolate(native,size=image.shape[-2:],mode='bilinear',align_corners=False)
 files={}
 for name,t in [('rgb',image[:,:3]),('codes',image[:,3:].argmax(1,keepdim=True).float()),('table',table),('native_map',native),('padded_map',full)]:
  p=out/f"case{c['id']}-{name}.f32";t.numpy().astype('<f4').tofile(p);files[name]={'file':p.name,'dims':list(t.shape)}
 cases.append({'id':c['id'],'metadata':meta,'files':files})
record['cases']=cases;(out/'manifest.json').write_text(json.dumps(record,indent=2)+'\n');print({'graphs':len(assets),'bytes':sum(a['bytes'] for a in assets.values())},flush=True)
