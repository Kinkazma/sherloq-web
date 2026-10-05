"""Exportable AdaIFL computations; every routing decision remains input dependent."""
import math, torch
import torch.nn.functional as F
from torch import nn

@torch.jit.script
def aggregate(x:torch.Tensor,weight:torch.Tensor,count:torch.Tensor,noise:torch.Tensor):
 integer=count.to(torch.int64);n=int(integer.item());k=int(integer.to(torch.float32).sqrt().to(torch.int64).item())
 # PyTorch cdist's default Euclidean MM path, including augmented norm columns.
 norm=x.pow(2).sum(1,keepdim=True);pad=torch.ones_like(norm)
 distance=(torch.cat([-2*x,norm,pad],1)@torch.cat([x,pad,norm],1).t()).clamp_min(0).sqrt()/math.sqrt(768.)
 nearest=distance.topk(k,dim=1,largest=False).values
 density=(-nearest.square().mean(1)).exp()+noise*1e-6
 mask=(density[None,:]>density[:,None]).to(x.dtype)
 separation=(distance*mask+distance.max()*(1-mask)).min(1).values
 centers=(separation*density).topk(n).indices
 assignment=distance[centers].argmin(0)
 assignment=assignment.scatter(0,centers,torch.arange(n,device=x.device,dtype=torch.int64))
 sums=torch.zeros((n,1),dtype=x.dtype,device=x.device).scatter_add(0,assignment[:,None],weight)+1e-6
 source=x*(weight/sums[assignment])
 return torch.zeros((n,768),dtype=x.dtype,device=x.device).scatter_add(0,assignment[:,None].expand_as(source),source)

class FIA(nn.Module):
 def __init__(self,original,model,noise):
  super().__init__();self.q=original.q;self.proj=original.proj;self.route=original.route;self.score=model.score_pred
  self.s1=model.R1_scale_pred;self.s2=model.R2_scale_pred;self.s3=model.R3_scale_pred
  self.register_buffer('kw',torch.stack([m.weight for m in original.kv_linears]));self.register_buffer('kb',torch.stack([m.bias for m in original.kv_linears]));self.register_buffer('noise',noise)
 def forward(self,x):
  q=self.q(x).reshape(1,4096,12,64).permute(0,2,1,3)[0]
  scores=self.score(x).exp().squeeze(2);scores,order=scores.sort(1)
  ordered=x[0,order[0]];weights=scores[0,:,None]
  scales=torch.cat([self.s1(scores[:,:1365]),self.s2(scores[:,1365:2730]),self.s3(scores[:,2730:])],1).softmax(1)[0]
  counts=(320*scales).clamp(16,320)
  a=aggregate(ordered[:1365],weights[:1365],counts[0],self.noise[:1365]);b=aggregate(ordered[1365:2730],weights[1365:2730],counts[1],self.noise[1365:2730]);c=aggregate(ordered[2730:],weights[2730:],counts[2],self.noise[2730:])
  tokens=torch.cat([a,b,c],0);route=self.route(x)[0];experts=route.topk(2).indices;outputs=[]
  for j in range(2):
   idx=experts[j];kv=F.linear(tokens,self.kw[idx],self.kb[idx]).reshape(-1,2,12,64).permute(1,2,0,3)
   attention=((q@kv[0].transpose(1,2))*.125).softmax(2)
   # Preserve the unusual native head/dimension/token ordering.
   output=(attention@kv[1]).transpose(1,2).reshape(768,4096).permute(1,0)
   outputs.append(output*route[idx])
  return self.proj((outputs[0]+outputs[1])[None])

class Experts(nn.Module):
 def __init__(self,original):
  super().__init__();self.gate=original.gate.w_gate;self.register_buffer('w1',original.experts.weight);self.register_buffer('w2',original.output_experts.weight)
 def forward(self,input):
  x=input.reshape(4096,768);gates,indices=self.gate(x).softmax(1).topk(2,dim=1)
  result=torch.zeros_like(x)
  # Execute only the selected rows of each expert, never replace token routing.
  for expert in range(6):
   selected=(indices==expert).nonzero();rows=selected[:,0];slots=selected[:,1]
   hidden=x[rows]@self.w1[expert]
   hidden=.5*hidden*(1+torch.tanh(math.sqrt(2/math.pi)*(hidden+.044715*hidden.pow(3))))
   output=(hidden@self.w2[expert])*gates[rows,slots,None]
   result=result.scatter_add(0,rows[:,None].expand_as(output),output)
  return result.reshape(1,64,64,768)

class Block(nn.Module):
 def __init__(self,original,attention,global_attention):
  super().__init__();self.norm1=original.norm1;self.norm2=original.norm2;self.attention=attention;self.mlp=original.mlp;self.moe=Experts(original.feature_moe);self.global_attention=global_attention
 def forward(self,x):
  norm=self.norm1(x);attended=self.attention(norm if self.global_attention else norm.reshape(1,4096,768));x=x+attended.reshape(1,64,64,768);norm=self.norm2(x)
  return x+self.moe(norm)+self.mlp(norm)
