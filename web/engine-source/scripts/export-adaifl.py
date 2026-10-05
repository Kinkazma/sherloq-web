"""Strict native AdaIFL reference and dynamic ONNX stage export."""
from pathlib import Path
import sys,json,hashlib,gc,types
import torch,numpy as np
from PIL import Image
import onnx
from torch.onnx import symbolic_helper
from m3_adaifl_graphs import FIA,Block
from m3_bounded_sam import bounded_forward
root=Path(__file__).resolve().parents[1];native=root.parent;sys.path.insert(0,str(native/'source'));torch.set_num_threads(2)
from gui.sherloq_app.core.adaifl import load
@symbolic_helper.parse_args('v','i','v','v')
def scatter_add_symbolic(g,value,dim,index,source):return g.op('ScatterElements',value,index,source,axis_i=dim,reduction_s='add').setType(value.type())
torch.onnx.register_custom_op_symbolic('aten::scatter_add',scatter_add_symbolic,19)
out=root/'.build/m3/learned';out.mkdir(exist_ok=True,parents=True);identity=next(r for r in json.loads((native/'models/external/manifest.json').read_text()) if r['file']=='AdaIFL_v0.pth');identity={k:identity[k] for k in ['file','bytes','sha256']};h=hashlib.sha256()
with (native/'models/external/AdaIFL_v0.pth').open('rb') as f:
 for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
assert h.hexdigest()==identity['sha256'];net=load('cpu').model
class Embed(torch.nn.Module):
 def __init__(self):super().__init__();self.patch=net.patch_embed;self.position=net.pos_embed
 def forward(self,image):return self.patch(image)+self.position
class Decode(torch.nn.Module):
 def __init__(self):super().__init__();self.decoder=net.decoder
 def forward(self,a,b,c,d):return self.decoder([x.permute(0,3,1,2) for x in [a,b,c,d]]).sigmoid()
records=[];graphs={}
def export(name,module,args,names,outputs=['output']):
 path=out/f'adaifl-{name}.onnx';print('Export '+name,flush=True);torch.onnx.export(module.eval(),args,path,input_names=names,output_names=outputs,opset_version=19,dynamo=False,external_data=False);m=onnx.load(path);onnx.checker.check_model(m);onnx.shape_inference.infer_shapes(m,check_type=True,strict_mode=True);del m;graphs[name]=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest());gc.collect()
with torch.inference_mode():
 rgb=np.fromfile(root/'.build/m3/sparse-positive-rgb.bin',np.uint8).reshape(176,448,3);pixels=np.asarray(Image.fromarray(rgb).resize((1024,1024),Image.Resampling.BILINEAR)).copy();image=torch.from_numpy(pixels.transpose(2,0,1).copy()).float().div(255)[None];image.numpy().tofile(out/'adaifl-input.bin')
 if '--reuse-native' in sys.argv:
  native_inputs=[torch.from_numpy(np.fromfile(out/f'adaifl-block-{i:02}-input.bin',np.float32).reshape(1,64,64,768)) for i in range(12)];native_outputs=[torch.from_numpy(np.fromfile(out/f'adaifl-block-{i:02}-output.bin',np.float32).reshape(1,64,64,768)) for i in range(12)];stages=[native_outputs[i] for i in net.global_attn_indexes]
 else:
  torch.manual_seed(1701);x=Embed()(image);native_inputs=[];native_outputs=[];stages=[]
  for i,block in enumerate(net.encoder):
   print('Native block '+str(i),flush=True);native_inputs.append(x);x=block(x,net.score_pred,net.R1_scale_pred,net.R2_scale_pred,net.R3_scale_pred);native_outputs.append(x)
   if i in net.global_attn_indexes:stages.append(x)
  output=Decode()(*stages);output.numpy().tofile(out/'adaifl-map.bin');print('Native complete',flush=True)
 generator=torch.Generator().manual_seed(1701);export('embedding',Embed(),image,['image'])
 for i,original in enumerate(net.encoder):
  global_attention=i in net.global_attn_indexes
  if global_attention:attention=original.attn;attention.forward=types.MethodType(bounded_forward,attention)
  else:attention=FIA(original.fi_attn,net,torch.rand((4096,),generator=generator))
  module=Block(original,attention,global_attention).eval();result=module(native_inputs[i]);expected=native_outputs[i];delta=(result-expected).abs();record=dict(block=i,differences=int((delta!=0).sum()),maximum=float(delta.max()));records.append(record);print(record,flush=True)
  # Each stage oracle is evaluated on native input so routing differences are visible.
  native_inputs[i].numpy().tofile(out/f'adaifl-block-{i:02}-input.bin');expected.numpy().tofile(out/f'adaifl-block-{i:02}-output.bin');export(f'block-{i:02}',module,native_inputs[i],['tokens'])
 export('decoder',Decode(),tuple(stages),['a','b','c','d'])
report=dict(schema=1,weight=identity,graphs=graphs,stageDifferences=records,torch=torch.__version__);(out/'adaifl-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');(root/'src/adaifl-assets.js').write_text('export const ADAIFL_MODEL=Object.freeze('+json.dumps(dict(weight=identity,graphs=graphs),separators=(',',':'))+');\n')
