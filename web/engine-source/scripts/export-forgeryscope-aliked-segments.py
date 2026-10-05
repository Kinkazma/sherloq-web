"""Native ALIKED operators for global, losslessly banked extraction.

Deformable offsets and interpolation coordinates stay global. Dense features
are reconstructed from the four native scales only where subsequently needed.
"""
from pathlib import Path
import json,hashlib,sys
import numpy as np
import torch,torchvision
import torch.nn.functional as F
from torch.onnx import symbolic_helper
root=Path(__file__).resolve().parents[1];native=root.parent
sys.path.insert(0,str(native/'source'))
from gui.sherloq_app.vendor.lightglue.aliked import ALIKED,simple_nms
from gui.sherloq_app.core.clone_models import verified,ROOT,WEIGHTS
import onnx
from onnx import numpy_helper
torch.set_num_threads(2);verified(ROOT/'models/external/aliked-n16.pth')
weight,sha=verified(WEIGHTS/'02_forgeryscope/aliked_wblot.pth')
model=ALIKED(model_name='aliked-n16',max_num_keypoints=512).eval()
state=torch.load(weight,map_location='cpu',weights_only=True)['model'];model.load_state_dict({k.removeprefix('extractor.'):v for k,v in state.items() if k.startswith('extractor.')},strict=True)
out=root/'.build/aliked-segments';out.mkdir(exist_ok=True,parents=True);assets={}
@symbolic_helper.parse_args('v','v','v','v','v','i','i','i','i','i','i','i','i','b')
def deform(g,x,w,offset,mask,bias,sh,sw,ph,pw,dh,dw,groups,offset_groups,use_mask):
 return g.op('DeformConv',x,w,offset,bias,*([mask] if use_mask else []),strides_i=[sh,sw],pads_i=[ph,pw,ph,pw],dilations_i=[dh,dw],group_i=groups,offset_group_i=offset_groups)
torch.onnx.register_custom_op_symbolic('torchvision::deform_conv2d',deform,19)
def emit(name,module,args,names,outputs,axes):
 path=out/(name+'.onnx');module.eval()
 with torch.inference_mode():torch.onnx.export(module,args,path,input_names=names,output_names=outputs,dynamic_axes=axes,opset_version=19,dynamo=False,external_data=False,do_constant_folding=False)
 graph=onnx.load(path);values={t.name:numpy_helper.to_array(t) for t in graph.graph.initializer};nodes=[]
 for node in graph.graph.node:
  if node.op_type=='Constant':
   value=next((a.t for a in node.attribute if a.name=='value'),None)
   if value is not None:values[node.output[0]]=numpy_helper.to_array(value)
  if node.op_type=='Cast' and node.input[0] in values:
   typ=next(a.i for a in node.attribute if a.name=='to');array=values[node.input[0]].astype(onnx.helper.tensor_dtype_to_np_dtype(typ));values[node.output[0]]=array;graph.graph.initializer.append(numpy_helper.from_array(array,node.output[0]));continue
  nodes.append(node)
 del graph.graph.node[:];graph.graph.node.extend(nodes);onnx.checker.check_model(graph);onnx.save(graph,path)
 assets['aliked/'+name]=dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,graphOptimizationLevel='disabled')
def spatial(name,module,c,co):
 emit(name,module,(torch.zeros(1,c,32,64),),['x'],['result'],{'x':{2:'h',3:'w'},'result':{2:'oh',3:'ow'}})
class First(torch.nn.Module):
 def __init__(self,project):super().__init__();self.block=model.block1;self.project=project;self.conv=model.conv1
 def forward(self,x):
  x=self.block(x)
  return F.selu(self.conv(x)) if self.project else F.avg_pool2d(x,2)
spatial('first-pool',First(False),3,16);spatial('first-project',First(True),3,32)
class Second(torch.nn.Module):
 def __init__(self):super().__init__();self.block=model.block2;self.conv=model.conv2
 def forward(self,x):
  x=self.block(x);return F.selu(self.conv(x)),F.avg_pool2d(x,4)
emit('second',Second(),(torch.zeros(1,16,32,64),),['x'],['projected','pooled'],{'x':{2:'h',3:'w'},'projected':{2:'h',3:'w'},'pooled':{2:'ph',3:'pw'}})
class Offset(torch.nn.Module):
 def __init__(self,conv):super().__init__();self.conv=conv.offset_conv
 def forward(self,x,bound):return self.conv(x).clamp(-bound,bound)
class Deform(torch.nn.Module):
 def __init__(self,conv,bn):super().__init__();self.conv=conv.regular_conv;self.bn=bn
 def forward(self,x,offset):return self.bn(torchvision.ops.deform_conv2d(x,offset,self.conv.weight,self.conv.bias,padding=(1,1)))
class Residual(torch.nn.Module):
 def __init__(self,block):super().__init__();self.downsample=block.downsample
 def forward(self,x,y):return F.selu(y+self.downsample(x))
for i,ci,co in [(3,32,64),(4,64,128)]:
 block=getattr(model,'block'+str(i))
 for j,c in [(1,ci),(2,co)]:
  conv=getattr(block,'conv'+str(j));bn=getattr(block,'bn'+str(j));prefix=f'b{i}-c{j}'
  emit(prefix+'-offset',Offset(conv),(torch.zeros(1,c,16,32),torch.tensor(8.)),['x','bound'],['result'],{'x':{2:'h',3:'w'},'result':{2:'h',3:'w'}})
  emit(prefix+'-deform',Deform(conv,bn),(torch.zeros(1,c,16,32),torch.zeros(1,18,16,32)),['x','offset'],['result'],{'x':{2:'h',3:'w'},'offset':{2:'h',3:'w'},'result':{2:'h',3:'w'}})
 emit(f'b{i}-residual',Residual(block),(torch.zeros(1,ci,16,32),torch.zeros(1,co,16,32)),['x','y'],['result'],{k:{2:'h',3:'w'} for k in ['x','y','result']})
 spatial(f'project{i}',torch.nn.Sequential(getattr(model,'conv'+str(i)),torch.nn.SELU()),co,32)
class Score(torch.nn.Module):
 def __init__(self):super().__init__();self.head=model.score_head
 def forward(self,x):return self.head(x).sigmoid()
spatial('score',Score(),128,1)
class Normalize(torch.nn.Module):
 def forward(self,x):return F.normalize(x,p=2,dim=1)
spatial('normalize',Normalize(),128,128)
class Gate(torch.nn.Module):
 def forward(self,x):return F.selu(x)
emit('gate',Gate(),(torch.zeros(1,64,32,64),),['x'],['result'],{'x':{1:'c',2:'h',3:'w'},'result':{1:'c',2:'h',3:'w'}})
class Pool(torch.nn.Module):
 def forward(self,x):return F.avg_pool2d(x,4)
spatial('pool4',Pool(),64,64)
class Nms(torch.nn.Module):
 def forward(self,x):return simple_nms(x,2)
spatial('nms',Nms(),1,1)
class Localize(torch.nn.Module):
 def __init__(self):super().__init__();self.register_buffer('grid',model.dkd.hw_grid)
 def forward(self,patch,xy,wh):
  ex=((patch-patch.amax(dim=1,keepdim=True))/.1).exp();residual=ex@self.grid/ex.sum(dim=1,keepdim=True)
  return (xy+residual)/wh*2-1
emit('localize',Localize(),(torch.zeros(5,25),torch.zeros(5,2),torch.tensor([127.,95.])),['patch','xy','wh'],['keypoints'],{k:{0:'n'} for k in ['patch','xy','keypoints']})
class DescribeOffset(torch.nn.Module):
 def __init__(self):super().__init__();self.conv=model.desc_head.offset_conv
 def forward(self,patch,keypoints,wh):
  pixels=(keypoints/2+.5)*wh;bound=(wh+1).amax()/4
  offset=self.conv(patch).clamp(-bound,bound)[:,:,0,0].reshape(-1,2,16).permute(0,2,1)
  return (2*(pixels[:,None]+offset)/wh-1).reshape(-1,2),offset
emit('describe-offset',DescribeOffset(),(torch.zeros(5,128,3,3),torch.zeros(5,2),torch.tensor([127.,95.])),['patch','keypoints','wh'],['positions','offset'],{k:{0:'n'} for k in ['patch','keypoints','offset']}|{'positions':{0:'samples'}})
class Describe(torch.nn.Module):
 def __init__(self):super().__init__();self.head=model.desc_head
 def forward(self,x):
  p=F.selu(self.head.sf_conv(x)).squeeze(-1);d=torch.einsum('ncp,pcd->nd',p,self.head.agg_weights)
  return F.normalize(d,p=2,dim=1)
emit('describe',Describe(),(torch.zeros(5,128,16,1),),['x'],['descriptors'],{'x':{0:'n'},'descriptors':{0:'n'}})
manifest=dict(schema=1,checkpointSha256=sha,assets=assets)
(out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n');print(json.dumps(dict(graphs=len(assets),bytes=sum(a['bytes'] for a in assets.values()))))
