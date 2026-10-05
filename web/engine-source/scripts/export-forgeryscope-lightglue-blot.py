"""Export the native blot LightGlue matcher (no adaptive depth/width in this profile)."""
from pathlib import Path
import argparse,hashlib,json,os,sys
import numpy as np,torch
parser=argparse.ArgumentParser();parser.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2]);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope';out.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(args.native_root/'source'),str(args.native_root/'integration/clone_detectors')]
from gui.sherloq_app.core.forgeryscope_adapter import local_lightglue
from gui.sherloq_app.core.clone_models import verified,WEIGHTS
import onnx
from gui.sherloq_app.vendor.lightglue.lightglue import normalize_keypoints,filter_matches
torch.set_num_threads(2)
model=local_lightglue('aliked',depth_confidence=-1,width_confidence=-1).eval()
path,checkpoint_sha=verified(WEIGHTS/'02_forgeryscope/aliked_wblot.pth')
state=torch.load(path,map_location='cpu',weights_only=True)['model']
weights={k.removeprefix('matcher.'):v for k,v in state.items() if k.startswith('matcher.')}
for i in range(9):weights={k.replace(f'self_attn.{i}',f'transformers.{i}.self_attn').replace(f'cross_attn.{i}',f'transformers.{i}.cross_attn'):v for k,v in weights.items()}
if 'confidence_thresholds' not in weights:weights['confidence_thresholds']=model.confidence_thresholds
model.load_state_dict(weights,strict=True)
class Network(torch.nn.Module):
 def __init__(self,model):super().__init__();self.model=model
 def forward(self,k0,k1,d0,d1,size0,size1):
  k0=normalize_keypoints(k0,size0).clone();k1=normalize_keypoints(k1,size1).clone()
  d0=self.model.input_proj(d0.detach().contiguous());d1=self.model.input_proj(d1.detach().contiguous())
  e0=self.model.posenc(k0);e1=self.model.posenc(k1)
  for layer in self.model.transformers:d0,d1=layer(d0,d1,e0,e1)
  assignment=self.model.log_assignment[-1]
  p0=assignment.final_proj(d0);p1=assignment.final_proj(d1)
  p0=p0/(p0.shape[-1]**.25);p1=p1/(p1.shape[-1]**.25)
  sim=torch.einsum('bmd,bnd->bmn',p0,p1)
  z0=assignment.matchability(d0);z1=assignment.matchability(d1)
  F=torch.nn.functional
  certainty=F.logsigmoid(z0)+F.logsigmoid(z1).transpose(1,2)
  core=F.log_softmax(sim,2)+F.log_softmax(sim.transpose(-1,-2).contiguous(),2).transpose(-1,-2)+certainty
  # filter_matches ignores the dustbin row/column. Padding avoids exporting
  # dynamic in-place scatter for those unused entries; core scores are identical.
  m0,m1,s0,s1=filter_matches(F.pad(core,(0,1,0,1)),self.model.conf.filter_threshold)
  return m0,s0,m1,s1
net=Network(model).eval();torch.manual_seed(43901)
def inputs(n,m):
 k0=torch.rand(1,n,2)*128;k1=torch.rand(1,m,2)*128
 d0=torch.nn.functional.normalize(torch.rand(1,n,128),dim=-1);d1=torch.nn.functional.normalize(torch.rand(1,m,128),dim=-1)
 common=min(n,m)//2;k1[:,:common]=k0[:,:common];d1[:,:common]=d0[:,:common]
 return (k0,k1,d0,d1,torch.tensor([[128.,128.]]),torch.tensor([[128.,128.]]))
names=['keypoints0','keypoints1','descriptors0','descriptors1','size0','size1'];outputs=['matches0','scores0','matches1','scores1']
target=out/'lightglue-blot.onnx'
# The dynamo exporter avoids the legacy rank-canonicalization bug. The wrapper
# executes every native layer of this non-adaptive profile, omitting only unused
# compact-index bookkeeping. Empty feature sets are handled before this graph.
M=torch.export.Dim('points0',min=1);N=torch.export.Dim('points1',min=1)
with torch.inference_mode():
 torch.onnx.export(net,inputs(32,40),target,input_names=names,output_names=outputs,opset_version=18,dynamo=True,external_data=False,
  dynamic_shapes=({1:M},{1:N},{1:M},{1:N},{},{}))
graph=onnx.load(target);onnx.checker.check_model(graph);cases=[]
for index,(n,m) in enumerate([(32,40),(73,51)]):
 values=inputs(n,m)
 with torch.inference_mode():
  actual=net(*values)
  k0,k1,d0,d1,z0,z1=values
  reference=model(dict(image0=dict(keypoints=k0,descriptors=d0,image_size=z0),image1=dict(keypoints=k1,descriptors=d1,image_size=z1)))
  for value,key in zip(actual,['matches0','matching_scores0','matches1','matching_scores1']):
   assert torch.equal(value,reference[key]), 'Wrapper changed native matching'

 rows=[]
 for name,value in zip(names,values):
  file=f'lightglue-blot-{index}-{name}.f32';value.numpy().astype('<f4').tofile(out/file);rows.append(dict(name=name,file=file,shape=list(value.shape)))
 cases.append(dict(id=index,inputs=rows,outputs={name:dict(shape=list(value.shape),data=value.flatten().tolist()) for name,value in zip(outputs,actual)}))
report=dict(schema=1,torch=torch.__version__,checkpointSha256=checkpoint_sha,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size,file=target.name,scope='blot profile only; native depth/width disabled',cases=cases)
(out/'lightglue-blot-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
