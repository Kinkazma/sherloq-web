"""Export tuned ALIKED dense features with the real ONNX DeformConv operator.

Input contract: native-preprocessed RGB float tensor. The native replicate
padding/unpadding stays in the graph, with dynamic spatial dimensions.
Keypoint detection/descriptor heads are separate work, not replaced by this graph.
"""
from pathlib import Path
import argparse,hashlib,json,sys
import numpy as np,torch,torchvision
parser=argparse.ArgumentParser();parser.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--unfused',action='store_true',default=True);parser.add_argument('--legacy-fused',dest='unfused',action='store_false');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope';out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(args.native_root/'source'))
from gui.sherloq_app.vendor.lightglue.aliked import ALIKED,DeformableConv2d
from gui.sherloq_app.core.clone_models import verified,ROOT,WEIGHTS
import onnx
from torch.onnx import symbolic_helper
torch.set_num_threads(2)
verified(ROOT/'models/external/aliked-n16.pth')
weight,weight_sha=verified(WEIGHTS/'02_forgeryscope/aliked_wblot.pth')
model=ALIKED(model_name='aliked-n16',max_num_keypoints=512).eval()
state=torch.load(weight,map_location='cpu',weights_only=True)['model']
model.load_state_dict({k.removeprefix('extractor.'):v for k,v in state.items() if k.startswith('extractor.')},strict=True)
@symbolic_helper.parse_args('v','v','v','v','v','i','i','i','i','i','i','i','i','b')
def deform(g,x,w,offset,mask,bias,sh,sw,ph,pw,dh,dw,groups,offset_groups,use_mask):
 return g.op('DeformConv',x,w,offset,bias,*([mask] if use_mask else []),strides_i=[sh,sw],pads_i=[ph,pw,ph,pw],dilations_i=[dh,dw],group_i=groups,offset_group_i=offset_groups)
torch.onnx.register_custom_op_symbolic('torchvision::deform_conv2d',deform,19)
class Network(torch.nn.Module):
 def __init__(self):super().__init__();self.model=model
 def forward(self,x):return self.model.extract_dense_map(x)
net=Network().eval();stem='aliked-blot-dense'+('-unfused' if args.unfused else '');path=out/(stem+'.onnx')
# Avoid freezing Python max(height,width) at the example orientation.
original_forward=DeformableConv2d.forward
def dynamic_deform(self,x):
 bound=torch._shape_as_tensor(x)[2:].amax().to(x.dtype)/4
 out=self.offset_conv(x)
 if self.mask:
  o1,o2,mask=torch.chunk(out,3,dim=1);offset=torch.cat((o1,o2),dim=1);mask=torch.sigmoid(mask)
 else:offset=out;mask=None
 offset=offset.clamp(-bound,bound)
 return torchvision.ops.deform_conv2d(input=x,offset=offset,weight=self.regular_conv.weight,bias=self.regular_conv.bias,padding=self.padding,mask=mask)
DeformableConv2d.forward=dynamic_deform
with torch.inference_mode():torch.onnx.export(net,(torch.zeros(1,3,96,128),),path,input_names=['image'],output_names=['features','scores'],opset_version=19,dynamo=False,external_data=False,do_constant_folding=not args.unfused,dynamic_axes={'image':{2:'height',3:'width'},'features':{2:'height',3:'width'},'scores':{2:'height',3:'width'}})
DeformableConv2d.forward=original_forward
onnx.checker.check_model(onnx.load(path));records=[]
for index,(h,w) in enumerate([(96,128),(160,128),(97,129)]):
 y,x=np.mgrid[:h,:w];rgb=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8)
 inp=torch.from_numpy(rgb.transpose(2,0,1).copy()).float()[None]/255
 with torch.inference_mode():features,scores=net(inp)
 files={}
 for name,t in [('input',inp),('features',features),('scores',scores)]:
  file=f'aliked-blot-dense-{index}-{name}.f32';t.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(t.shape))
 records.append(dict(id=index,files=files))
report=dict(schema=1,graphOptimizationLevel='disabled' if args.unfused else 'all',torch=torch.__version__,checkpointSha256=weight_sha,file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=records)
(out/(stem+'-reference.json')).write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
