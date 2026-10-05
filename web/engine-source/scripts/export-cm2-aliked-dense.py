# Adapted from M2 commit 1040c53, source SHA256 b3bcdd534ad51d74be822e81a23289da50f34045ae56b505af73203dbbf3a1e0.
# CM2 uses the original n16 / n16rot checkpoint, never the tuned Blot checkpoint.
"""Export native CM2 ALIKED dense features with the real ONNX DeformConv operator.

Input contract: native-preprocessed RGB float tensor. The native replicate
padding/unpadding stays in the graph, with dynamic spatial dimensions.
Keypoint detection/descriptor heads are separate work, not replaced by this graph.
"""
from pathlib import Path
import argparse,hashlib,json,sys
import numpy as np,torch,torchvision
parser=argparse.ArgumentParser();parser.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--kind',choices=['aliked-n16','aliked-n16rot'],default='aliked-n16');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/m3/learned';out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(args.native_root/'source'))
from gui.sherloq_app.vendor.lightglue.aliked import ALIKED,DeformableConv2d
ROOT = args.native_root
def verified(path):
 identity=next(row for row in json.loads((path.parent/'manifest.json').read_text()) if row['file']==path.name)
 sha=hashlib.sha256(path.read_bytes()).hexdigest()
 assert sha==identity['sha256'],path.name
 return path,sha
import onnx
from torch.onnx import symbolic_helper
torch.set_num_threads(2)
weight,weight_sha=verified(ROOT/'models/external'/f'{args.kind}.pth')
model=ALIKED(model_name=args.kind,max_num_keypoints=-1).eval()
@symbolic_helper.parse_args('v','v','v','v','v','i','i','i','i','i','i','i','i','b')
def deform(g,x,w,offset,mask,bias,sh,sw,ph,pw,dh,dw,groups,offset_groups,use_mask):
 return g.op('DeformConv',x,w,offset,bias,*([mask] if use_mask else []),strides_i=[sh,sw],pads_i=[ph,pw,ph,pw],dilations_i=[dh,dw],group_i=groups,offset_group_i=offset_groups)
torch.onnx.register_custom_op_symbolic('torchvision::deform_conv2d',deform,19)
class Network(torch.nn.Module):
 def __init__(self):super().__init__();self.model=model
 def forward(self,x):return self.model.extract_dense_map(x)
net=Network().eval();path=out/f'{args.kind}-dense.onnx'
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
with torch.inference_mode():torch.onnx.export(net,(torch.zeros(1,3,96,128),),path,input_names=['image'],output_names=['features','scores'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={'image':{2:'height',3:'width'},'features':{2:'height',3:'width'},'scores':{2:'height',3:'width'}})
DeformableConv2d.forward=original_forward
onnx.checker.check_model(onnx.load(path));records=[]
for index,(h,w) in enumerate([(96,128),(160,128),(97,129)]):
 y,x=np.mgrid[:h,:w];rgb=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],axis=2).astype(np.uint8)
 inp=torch.from_numpy(rgb.transpose(2,0,1).copy()).float()[None]/255
 with torch.inference_mode():features,scores=net(inp)
 files={}
 for name,t in [('input',inp),('features',features),('scores',scores)]:
  file=f'{args.kind}-dense-{index}-{name}.f32';t.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(t.shape))
 records.append(dict(id=index,files=files))
report=dict(schema=1,torch=torch.__version__,checkpointSha256=weight_sha,file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=records)
(out/f'{args.kind}-dense-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
