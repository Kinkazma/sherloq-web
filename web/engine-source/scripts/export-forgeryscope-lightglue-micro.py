"""Export adaptive microscopy LightGlue as initial/layer/assignment graphs.

Host decisions preserve native early stop/pruning; no traced fixed-depth shortcut.
Models and native references stay in the calling worktree's .build.
"""
from pathlib import Path
import argparse,hashlib,json,sys,gc
import torch,numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2]);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope/micro';out.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(args.native_root/'source'),str(args.native_root/'integration/clone_detectors')]
from gui.sherloq_app.core.forgeryscope_adapter import local_lightglue
from gui.sherloq_app.core.clone_models import verified,ROOT
from gui.sherloq_app.vendor.lightglue.lightglue import normalize_keypoints,filter_matches
import onnx
torch.set_num_threads(2)
model=local_lightglue('sift',depth_confidence=.9,width_confidence=.9).eval()
_,weight_sha=verified(ROOT/'models/external/sift_lightglue.pth')
class Initial(torch.nn.Module):
 def __init__(self):super().__init__();self.proj=model.input_proj;self.posenc=model.posenc
 def forward(self,k0,k1,d0,d1,size0,size1,scale0,scale1,ori0,ori1):
  p0=torch.cat([normalize_keypoints(k0,size0).clone(),scale0.unsqueeze(-1),ori0.unsqueeze(-1)],-1)
  p1=torch.cat([normalize_keypoints(k1,size1).clone(),scale1.unsqueeze(-1),ori1.unsqueeze(-1)],-1)
  return self.proj(d0.detach().contiguous()),self.proj(d1.detach().contiguous()),self.posenc(p0),self.posenc(p1)
class Layer(torch.nn.Module):
 def __init__(self,index):
  super().__init__();self.index=index;self.layer=model.transformers[index]
  if index<8:self.token=model.token_confidence[index];self.assignment=model.log_assignment[index]
 def forward(self,d0,d1,e0,e1):
  a,b=self.layer(d0,d1,e0,e1)
  if self.index==8:return a,b
  c0,c1=self.token(a,b)
  return a,b,c0,c1,self.assignment.get_matchability(a),self.assignment.get_matchability(b)
class Assignment(torch.nn.Module):
 def __init__(self,index):super().__init__();self.assignment=model.log_assignment[index]
 def forward(self,d0,d1):
  a=self.assignment;p0=a.final_proj(d0);p1=a.final_proj(d1)
  p0=p0/(p0.shape[-1]**.25);p1=p1/(p1.shape[-1]**.25)
  sim=torch.einsum('bmd,bnd->bmn',p0,p1);z0=a.matchability(d0);z1=a.matchability(d1);F=torch.nn.functional
  certainty=F.logsigmoid(z0)+F.logsigmoid(z1).transpose(1,2)
  core=F.log_softmax(sim,2)+F.log_softmax(sim.transpose(-1,-2).contiguous(),2).transpose(-1,-2)+certainty
  m0,m1,s0,s1=filter_matches(F.pad(core,(0,1,0,1)),model.conf.filter_threshold)
  return m0,s0,m1,s1
M=torch.export.Dim('points0',min=1);N=torch.export.Dim('points1',min=1)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
graphs=[]
def export(name,net,inputs,input_names,outputs,shapes):
 target=out/(name+'.onnx')
 with torch.inference_mode():torch.onnx.export(net.eval(),inputs,target,input_names=input_names,output_names=outputs,opset_version=18,dynamo=True,external_data=False,dynamic_shapes=shapes)
 onnx.checker.check_model(onnx.load(target));graphs.append(dict(id=name,file=target.name,sha256=sha(target),bytes=target.stat().st_size))
 print(name,target.stat().st_size,flush=True);gc.collect()

def inputs(n,m,kind):
 k0=torch.rand(1,n,2)*128;k1=torch.rand(1,m,2)*128
 d0=torch.nn.functional.normalize(torch.rand(1,n,128),dim=-1);d1=torch.nn.functional.normalize(torch.rand(1,m,128),dim=-1)
 scale0=torch.rand(1,n)*8;scale1=torch.rand(1,m)*8;ori0=torch.rand(1,n)*6;ori1=torch.rand(1,m)*6
 common=min(n,m) if kind=='identical' else min(n,m)//2 if kind=='mixed' else 0
 k1[:,:common]=k0[:,:common];d1[:,:common]=d0[:,:common];scale1[:,:common]=scale0[:,:common];ori1[:,:common]=ori0[:,:common]
 return k0,k1,d0,d1,torch.tensor([[128.,128.]]),torch.tensor([[128.,128.]]),scale0,scale1,ori0,ori1

torch.manual_seed(53840);sample=inputs(32,40,'mixed');initial=Initial().eval()
input_names=['keypoints0','keypoints1','descriptors0','descriptors1','size0','size1','scales0','scales1','oris0','oris1']
export('initial',initial,sample,input_names,['desc0','desc1','encoding0','encoding1'],({1:M},{1:N},{1:M},{1:N},{},{},{1:M},{1:N},{1:M},{1:N}))
with torch.inference_mode():stage=initial(*sample)
for i in range(9):
 export(f'layer-{i}',Layer(i),stage,['desc0','desc1','encoding0','encoding1'],['next0','next1']+([] if i==8 else ['confidence0','confidence1','matchability0','matchability1']),({1:M},{1:N},{3:M},{3:N}))
 export(f'assignment-{i}',Assignment(i),stage[:2],['desc0','desc1'],['matches0','scores0','matches1','scores1'],({1:M},{1:N}))
records=[]
for index,(n,m,kind) in enumerate([(32,40,'mixed'),(47,47,'identical'),(53,61,'unrelated')]):
 values=inputs(n,m,kind);k0,k1,d0,d1,size0,size1,s0,s1,o0,o1=values
 data=dict(image0=dict(keypoints=k0,descriptors=d0,image_size=size0,scales=s0,oris=o0),image1=dict(keypoints=k1,descriptors=d1,image_size=size1,scales=s1,oris=o1))
 with torch.inference_mode():result=model(data)
 entries=[]
 for name,value in zip(input_names,values):
  file=f'case-{index}-{name}.f32';value.numpy().astype('<f4').tofile(out/file);entries.append(dict(name=name,file=file,shape=list(value.shape)))
 output={k:result[k].flatten().tolist() for k in ['matches0','matches1','matching_scores0','matching_scores1','prune0','prune1']}
 records.append(dict(id=index,kind=kind,inputs=entries,stop=result['stop'],outputs=output));print('case',index,'stop',result['stop'],'matches',len(result['matches'][0]),flush=True)
(out/'reference.json').write_text(json.dumps(dict(schema=1,torch=torch.__version__,checkpointSha256=weight_sha,graphs=graphs,cases=records),separators=(',',':'))+'\n')
