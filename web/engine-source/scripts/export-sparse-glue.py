"""Export the actual spatially sparse learned matcher, including every layer.
Candidates are supplied before cross attention. Dynamic loops bound edge gathers
and query attention; no dense-match-then-spatial-filter substitute is introduced.
"""
from pathlib import Path
import sys,json,hashlib,argparse,types
import torch,numpy as np
import torch.nn.functional as F
root=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--native-root',type=Path,default=root.parent);p.add_argument('--kind',choices=['xfeat','aliked','sift'],default='xfeat');a=p.parse_args();sys.path.insert(0,str(a.native_root/'source'));torch.set_num_threads(2)
from gui.sherloq_app.core.learned_copy import lighter_model,lightglue_model,scores as native_scores
from gui.sherloq_app.vendor.lightglue.lightglue import normalize_keypoints
import onnx
from torch.onnx import symbolic_helper
@symbolic_helper.parse_args('v','i','v','v')
def scatter_add_symbolic(g,values,dimension,indices,source):
 return g.op('ScatterElements',values,indices,source,axis_i=dimension,reduction_s='add').setType(values.type())
torch.onnx.register_custom_op_symbolic('aten::scatter_add',scatter_add_symbolic,19)
@symbolic_helper.parse_args('v','i','v','v','s','b')
def scatter_reduce_symbolic(g,values,dimension,indices,source,reduction,include_self):
 assert reduction=='amax' and include_self
 return g.op('ScatterElements',values,indices,source,axis_i=dimension,reduction_s='max').setType(values.type())
torch.onnx.register_custom_op_symbolic('aten::scatter_reduce',scatter_reduce_symbolic,19)

out=root/'.build/m3/learned';out.mkdir(exist_ok=True,parents=True);file={'xfeat':'xfeat-lighterglue.pt','aliked':'aliked_lightglue.pth','sift':'sift_lightglue.pth'}[a.kind];weight=a.native_root/'models/external'/file;identity=next(r for r in json.loads((weight.parent/'manifest.json').read_text()) if r['file']==file);assert hashlib.sha256(weight.read_bytes()).hexdigest()==identity['sha256'];model=lighter_model('cpu') if a.kind=='xfeat' else lightglue_model('cpu',a.kind)
@torch.jit.script
def edge_logits(x:torch.Tensor,y:torch.Tensor,ia:torch.Tensor,ib:torch.Tensor):
 parts=torch.jit.annotate(list[torch.Tensor],[])
 for lo in range(0,ia.size(0),16384):parts.append((x[:,ia[lo:lo+16384]]*y[:,ib[lo:lo+16384]]).sum(2))
 return torch.cat(parts,dim=1)
@torch.jit.script
def grouped(logits:torch.Tensor,indices:torch.Tensor,points:torch.Tensor):
 index=indices[None].expand(logits.size(0),indices.size(0));maximum=logits.new_full((logits.size(0),points.size(0)),-float('inf'));maximum.scatter_reduce_(1,index,logits,reduce='amax',include_self=True)
 centered=logits-maximum.gather(1,index);sums=logits.new_zeros((logits.size(0),points.size(0)));sums.scatter_add_(1,index,centered.exp())
 return centered-sums.gather(1,index).log()
@torch.jit.script
def accumulate(weights:torch.Tensor,values:torch.Tensor,queries:torch.Tensor,targets:torch.Tensor,points:torch.Tensor):
 result=values.new_zeros((values.size(0),points.size(0),values.size(2)))
 for lo in range(0,queries.size(0),8192):
  q=queries[lo:lo+8192];t=targets[lo:lo+8192];v=values[:,t]*weights[:,lo:lo+8192,None];result.scatter_add_(1,q[None,:,None].expand_as(v),v)
 return result
@torch.jit.script
def bounded_attention(q:torch.Tensor,k:torch.Tensor,v:torch.Tensor):
 parts=torch.jit.annotate(list[torch.Tensor],[])
 for lo in range(0,q.size(2),128):parts.append(F.scaled_dot_product_attention(q[:,:,lo:lo+128].contiguous(),k.contiguous(),v.contiguous()))
 return torch.cat(parts,dim=2)
def explicit_self(self,x,encoding,mask=None,n=None):
 n=x.shape[1] if n is None else n;heads=self.num_heads;d=self.head_dim
 qkv=self.Wqkv(x).reshape(1,n,heads,d,3).permute(0,2,1,3,4)
 q,k,v=qkv[:,:,:,:,0],qkv[:,:,:,:,1],qkv[:,:,:,:,2]
 def rotary(t):
  pairs=t.reshape(1,heads,n,d//2,2)
  rotated=torch.stack((-pairs[:,:,:,:,1],pairs[:,:,:,:,0]),4).reshape(1,heads,n,d)
  return t*encoding[0]+rotated*encoding[1]
 context=bounded_attention(rotary(q),rotary(k),v)
 message=self.out_proj(context.transpose(1,2).reshape(1,n,self.embed_dim))
 return x+self.ffn(torch.cat((x,message),2))
class Matcher(torch.nn.Module):
 def __init__(self):super().__init__();self.model=model
 def forward(self,k0,k1,d0,d1,edges,size,so0,so1):
  ia,ib=edges[:,0],edges[:,1];keypoints=[normalize_keypoints(k[None],size) for k in [k0,k1]]
  if self.model.conf.add_scale_ori:keypoints=[torch.cat((k,s[None]),-1) for k,s in zip(keypoints,[so0,so1])]
  x0,x1=[self.model.input_proj(d[None]) for d in [d0,d1]];e0,e1=[self.model.posenc(k) for k in keypoints]
  for layer in self.model.transformers:
   x0,x1=(layer.self_attn(x0,e0,None,k0.size(0)),layer.self_attn(x1,e1,None,k1.size(0))) if getattr(self,"bounded",False) else (layer.self_attn(x0,e0),layer.self_attn(x1,e1));block=layer.cross_attn
   q0,q1=block.to_qk(x0),block.to_qk(x1);v0,v1=block.to_v(x0),block.to_v(x1)
   q0,q1,v0,v1=[v[0].reshape(n,block.heads,self.model.conf.descriptor_dim//block.heads).transpose(0,1) for v,n in zip([q0,q1,v0,v1],[k0.size(0),k1.size(0),k0.size(0),k1.size(0)])]
   logits=edge_logits(q0*block.scale**.5,q1*block.scale**.5,ia,ib)
   m0=accumulate(grouped(logits,ia,k0).exp(),v1,ia,ib,k0);m1=accumulate(grouped(logits,ib,k1).exp(),v0,ib,ia,k1)
   m0,m1=[block.to_out(v.transpose(0,1).flatten(1)[None]) for v in [m0,m1]]
   x0,x1=x0+block.ffn(torch.cat((x0,m0),2)),x1+block.ffn(torch.cat((x1,m1),2))
  assignment=self.model.log_assignment[-1];p0,p1=[assignment.final_proj(x)[0][None]/self.model.conf.descriptor_dim**.25 for x in [x0,x1]];logits=edge_logits(p0,p1,ia,ib);z0,z1=[F.logsigmoid(assignment.matchability(x)).reshape(-1) for x in [x0,x1]]
  return (grouped(logits,ia,k0)+grouped(logits,ib,k1)+z0[ia]+z1[ib]).exp()[0]
net=Matcher().eval();dim=64 if a.kind=='xfeat' else 128;records=[];inputs_for_export=None
with torch.inference_mode():
 for index,(n,m,degree) in enumerate([(19,23,5),(139,151,130),(80,80,80)]):
  rng=np.random.default_rng(1701+index);k0=rng.uniform(0,512,(n,2)).astype(np.float32);k1=rng.uniform(0,512,(m,2)).astype(np.float32);d0=rng.normal(size=(n,dim)).astype(np.float32);d1=rng.normal(size=(m,dim)).astype(np.float32);d0/=np.linalg.norm(d0,axis=1,keepdims=True);d1/=np.linalg.norm(d1,axis=1,keepdims=True);edges=np.array([(i,j) for i in range(n) for j in rng.choice(m,min(m,degree),replace=False)],np.int64);so0=np.ones((n,2),np.float32);so1=np.ones((m,2),np.float32)
  if index==2:
   if a.kind=='xfeat':
    d0=np.fromfile(out/'xfeat-0-descriptors.bin',np.float32).reshape(-1,64)[:n].copy();k0=np.fromfile(out/'xfeat-0-keypoints.bin',np.float32).reshape(-1,2)[:n].copy()
   elif a.kind=='aliked':
    d0=np.fromfile(out/'aliked-n16-extract-descriptors.bin',np.float32).reshape(-1,128)[:n].copy();k0=np.fromfile(out/'aliked-n16-extract-points.bin',np.float64).reshape(-1,7)[:n,:2].astype(np.float32)
   d1=d0.copy();k1=k0+np.array([224,0],np.float32);edges=np.array([(i,j) for i in range(n) for j in range(m)],np.int64)
  inp=tuple(torch.from_numpy(v) for v in [k0,k1,d0,d1,edges,np.array([512,384],np.float32),so0,so1]);expected=native_scores(model,k0,k1,d0,d1,edges,(512,384),scale_ori=[so0,so1] if a.kind=='sift' else None);actual=net(*inp).numpy();assert np.array_equal(actual,expected),(a.kind,index,np.max(np.abs(actual-expected)))
  files={}
  for name,t in [*zip(['keypoints0','keypoints1','descriptors0','descriptors1','edges','imageSize','scaleOri0','scaleOri1'],inp),('confidence',torch.from_numpy(expected))]:
   filename=f'{a.kind}-sparse-glue-{index}-{name}.bin';t.numpy().tofile(out/filename);files[name]=dict(file=filename,shape=list(t.shape),dtype='int64' if name=='edges' else 'float32')
  records.append(dict(id=index,files=files));inputs_for_export=inp if index==1 else inputs_for_export
 # Keep self-attention mathematically unchanged, but bound exported attention
 # matrices by query blocks. Record actual native arithmetic differences.
 for layer in model.transformers:
  layer.self_attn.forward=types.MethodType(explicit_self,layer.self_attn)
 net.bounded=True
 bounded=net(*inputs_for_export).numpy();expected=np.fromfile(out/records[1]['files']['confidence']['file'],np.float32);bounded_max=float(np.max(np.abs(bounded-expected)))
 path=out/f'{a.kind}-sparse-glue.onnx';names=['keypoints0','keypoints1','descriptors0','descriptors1','edges','imageSize','scaleOri0','scaleOri1'];axes={n:{0:'points0' if n.endswith('0') else 'points1'} for n in names if n not in ['imageSize','edges']};axes.update(edges={0:'edges'},confidence={0:'edges'})
 torch.onnx.export(net,inputs_for_export,path,input_names=names,output_names=['confidence'],dynamic_axes=axes,opset_version=19,dynamo=False,external_data=False)
onnx.checker.check_model(onnx.load(path));graph=onnx.load(path);report=dict(schema=1,kind=a.kind,weightSha256=identity['sha256'],file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),inputs=[i.name for i in graph.graph.input],nativeWrapperExact=True,boundedAttentionMaximum=bounded_max,cases=records);(out/f'{a.kind}-sparse-glue-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:v for k,v in report.items() if k!='cases'}),flush=True)
