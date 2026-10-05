"""Export native learned layers as bounded stages; cross attention remains global.
No weights are embedded in the runtime or Git. The bundle is explicitly pinned.
"""
from pathlib import Path
import sys,json,hashlib,argparse,types,struct
import torch,numpy as np
import torch.nn.functional as F
root=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--kind',choices=['xfeat','aliked','sift'],default='xfeat');a=p.parse_args();sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2)
from gui.sherloq_app.core.learned_copy import lighter_model,lightglue_model
from gui.sherloq_app.vendor.lightglue.lightglue import normalize_keypoints
import onnx
# Reuse the qualified bounded self-attention expression, without executing the
# monolithic export recipe or its development corpus.
source=(root/'scripts/export-sparse-glue.py').read_text();start=source.index('@torch.jit.script\ndef bounded_attention');end=source.index('class Matcher',start)
namespace={'torch':torch,'F':F};code=source[start:end];helper=root/'.build/m3/learned/paged-self-helper.py';helper.write_text(code);import importlib.util
spec=importlib.util.spec_from_file_location('m3_paged_self',helper);module=importlib.util.module_from_spec(spec);module.torch=torch;module.F=F;spec.loader.exec_module(module)
model=lighter_model('cpu') if a.kind=='xfeat' else lightglue_model('cpu',a.kind)
for layer in model.transformers:layer.self_attn.forward=types.MethodType(module.explicit_self,layer.self_attn)
dim=model.conf.descriptor_dim;heads=model.transformers[0].cross_attn.heads;input_dim=64 if a.kind=='xfeat' else 128
out=root/'.build/m3/learned';out.mkdir(exist_ok=True,parents=True);stages=[];payload=[]
def export(name,net,inputs,input_names,output_names,axes):
 path=out/f'{a.kind}-paged-{name}.onnx';torch.onnx.export(net.eval(),inputs,path,input_names=input_names,output_names=output_names,dynamic_axes=axes,opset_version=19,dynamo=False,external_data=False);onnx.checker.check_model(onnx.load(path));data=path.read_bytes();stages.append(dict(name=name,offset=sum(map(len,payload)),bytes=len(data),sha256=hashlib.sha256(data).hexdigest()));payload.append(data);return tuple(net(*inputs))
class Prepare(torch.nn.Module):
 def __init__(self):super().__init__();self.input=model.input_proj;self.position=model.posenc
 def forward(self,keypoints,descriptors,imageSize,scaleOri):
  k=normalize_keypoints(keypoints[None],imageSize)
  if model.conf.add_scale_ori:k=torch.cat((k,scaleOri[None]),-1)
  e=self.position(k);return self.input(descriptors[None]),e[0],e[1]
class Self(torch.nn.Module):
 def __init__(self,layer):super().__init__();self.attention=layer.self_attn;self.q=layer.cross_attn.to_qk;self.v=layer.cross_attn.to_v;self.scale=layer.cross_attn.scale**.5
 def forward(self,x,cos,sin):
  x=self.attention(x,torch.stack((cos,sin)),None,x.size(1));q=self.q(x)[0].reshape(x.size(1),heads,dim//heads).transpose(0,1)*self.scale;v=self.v(x)[0].reshape(x.size(1),heads,dim//heads).transpose(0,1);return x,q,v
class Finish(torch.nn.Module):
 def __init__(self,layer):super().__init__();self.output=layer.cross_attn.to_out;self.ffn=layer.cross_attn.ffn
 def forward(self,x,context):return (x+self.ffn(torch.cat((x,self.output(context.transpose(0,1).flatten(1)[None])),2)),)
class Final(torch.nn.Module):
 def __init__(self):super().__init__();self.assignment=model.log_assignment[-1]
 def forward(self,x):return self.assignment.final_proj(x)[0][None]/dim**.25,F.logsigmoid(self.assignment.matchability(x)).reshape(-1)
torch.manual_seed(19);n=139;k=torch.rand(n,2)*512;d=F.normalize(torch.randn(n,input_dim),dim=1);size=torch.tensor([512.,384.]);so=torch.ones(n,2)
with torch.inference_mode():
 x,cos,sin=export('prepare',Prepare(),(k,d,size,so),['keypoints','descriptors','imageSize','scaleOri'],['x','cos','sin'],{'keypoints':{0:'points'},'descriptors':{0:'points'},'scaleOri':{0:'points'},'x':{1:'points'},'cos':{2:'points'},'sin':{2:'points'}})
 for i,layer in enumerate(model.transformers):
  x,q,v=export(f'self-{i}',Self(layer),(x,cos,sin),['x','cos','sin'],['next','q','v'],{'x':{1:'points'},'cos':{2:'points'},'sin':{2:'points'},'next':{1:'points'},'q':{1:'points'},'v':{1:'points'}})
  x,=export(f'finish-{i}',Finish(layer),(x,v),['x','context'],['next'],{'x':{1:'points'},'context':{1:'points'},'next':{1:'points'}})
 export('final',Final(),(x,),['x'],['projected','matchability'],{'x':{1:'points'},'projected':{1:'points'},'matchability':{0:'points'}})
file={'xfeat':'xfeat-lighterglue.pt','aliked':'aliked_lightglue.pth','sift':'sift_lightglue.pth'}[a.kind];weight=root.parent/'models/external'/file;weight_sha=hashlib.sha256(weight.read_bytes()).hexdigest();manifest=json.dumps(dict(schema=1,kind=a.kind,dim=dim,heads=heads,layers=len(model.transformers),weightSha256=weight_sha,stages=stages),separators=(',',':')).encode();bundle=struct.pack('<I',len(manifest))+manifest+b''.join(payload);path=out/f'{a.kind}-sparse-glue-paged.bin';path.write_bytes(bundle);report=dict(file=path.name,bytes=len(bundle),sha256=hashlib.sha256(bundle).hexdigest(),weightSha256=weight_sha,layers=len(model.transformers),heads=heads,dim=dim);(out/f'{a.kind}-sparse-glue-paged.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
