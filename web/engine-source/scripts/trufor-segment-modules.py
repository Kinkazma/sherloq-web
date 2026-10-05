"""Same global TruFor, split at native operator boundaries and local row halos."""
import torch
from torch import nn
from torch.nn import functional as F

class PatchWindow(nn.Module):
 """Caller supplies vertical zero padding only at original image boundaries."""
 def __init__(self,layer):super().__init__();self.conv=layer.proj;self.norm=layer.norm
 def forward(self,x):
  x=F.conv2d(x,self.conv.weight,self.conv.bias,stride=self.conv.stride,padding=(0,self.conv.padding[1]));b,c,h,w=x.shape
  return self.norm(x.flatten(2).transpose(1,2)).transpose(1,2).reshape(b,c,h,w)
class KeyValues(nn.Module):
 """Stride-aligned rows cover every native spatial-reduction key once."""
 def __init__(self,block):super().__init__();self.norm=block.norm1;self.attn=block.attn
 def forward(self,x):
  b,c,h,w=x.shape;t=self.norm(x.flatten(2).transpose(1,2))
  if self.attn.sr_ratio>1:
   x=self.attn.sr(t.transpose(1,2).reshape(b,c,h,w));h,w=x.shape[2:];t=self.attn.norm(x.flatten(2).transpose(1,2))
  return self.attn.kv(t).transpose(1,2).reshape(b,2*c,h,w)
class QueryWindow(nn.Module):
 """Each query chunk attends to ALL image keys, including remote rows."""
 def __init__(self,block):super().__init__();self.norm=block.norm1;self.attn=block.attn
 def forward(self,x,key,value):
  b,c,h,w=x.shape;t=x.flatten(2).transpose(1,2);heads=self.attn.num_heads
  q=self.attn.q(self.norm(t)).reshape(b,-1,heads,c//heads).permute(0,2,1,3)
  a=((q@key)*self.attn.scale).softmax(-1)
  return (t+self.attn.proj((a@value).transpose(1,2).reshape(b,-1,c))).transpose(1,2).reshape(b,c,h,w)
class QueryWindowSplitValue(QueryWindow):
 """Global softmax is unchanged; parallelize only the long P@V reduction.

 Zero padding happens AFTER normalization. All true keys retain their original
 probability; chunk products are summed before learned projection/residual.
 """
 def forward(self,x,key,value):
  b,c,h,w=x.shape;t=x.flatten(2).transpose(1,2);heads=self.attn.num_heads
  q=self.attn.q(self.norm(t)).reshape(b,-1,heads,c//heads).permute(0,2,1,3)
  a=((q@key)*self.attn.scale).softmax(-1)
  n,k=a.shape[-2:];pad=(-k)%1024
  a=F.pad(a,(0,pad)).reshape(b,heads,n,-1,1024).permute(0,1,3,2,4)
  v=F.pad(value,(0,0,0,pad)).reshape(b,heads,-1,1024,c//heads)
  product=(a@v).sum(2)
  return (t+self.attn.proj(product.transpose(1,2).reshape(b,-1,c))).transpose(1,2).reshape(b,c,h,w)
class MlpWindow(nn.Module):
 def __init__(self,block):super().__init__();self.norm=block.norm2;self.mlp=block.mlp
 def forward(self,x):
  b,c,h,w=x.shape;t=x.flatten(2).transpose(1,2)
  return (t+self.mlp(self.norm(t),h,w)).transpose(1,2).reshape(b,c,h,w)
class RectifyWeights(nn.Module):
 def __init__(self,layer):super().__init__();self.mlp=layer.channel_weights.mlp
 def forward(self,stats):return self.mlp(stats).reshape(1,2,-1,1,1).permute(1,0,2,3,4)
class RectifyWindow(nn.Module):
 def __init__(self,layer):super().__init__();self.spatial=layer.spatial_weights;self.lc=layer.lambda_c;self.ls=layer.lambda_s
 def forward(self,a,b,channel):
  spatial=self.spatial(a,b)
  return a+self.lc*channel[1]*b+self.ls*spatial[1]*b,b+self.lc*channel[0]*a+self.ls*spatial[0]*a
class ContextPart(nn.Module):
 """Raw local K-transpose V contribution, globally summed BEFORE softmax."""
 def __init__(self,layer,heads):super().__init__();self.layer=layer;self.heads=heads
 def forward(self,x):
  b,c,h,w=x.shape;k,v=self.layer(x.flatten(2).transpose(1,2)).reshape(b,-1,2,self.heads,c//self.heads).permute(2,0,3,1,4)
  return k.transpose(-2,-1)@v
class ChannelWindow(nn.Module):
 def __init__(self,layer):super().__init__();self.layer=layer
 def forward(self,a,b):
  x=torch.cat((a,b),1);return self.layer.norm(self.layer.residual(x)+self.layer.channel_embed(x))
class HeadProject(nn.Module):
 def __init__(self,layer):super().__init__();self.layer=layer
 def forward(self,x):
  b,c,h,w=x.shape;return self.layer(x.flatten(2).transpose(1,2)).transpose(1,2).reshape(b,-1,h,w)
class HeadSample(nn.Module):
 def __init__(self,layer):super().__init__();self.projection=HeadProject(layer)
 def forward(self,x,grid):return F.grid_sample(self.projection(x),grid,mode='bilinear',padding_mode='border',align_corners=False)
class HeadFuse(nn.Module):
 def __init__(self,head):super().__init__();self.fuse=head.linear_fuse;self.pred=head.linear_pred
 def forward(self,c4,c3,c2,c1):return self.pred(self.fuse(torch.cat((c4,c3,c2,c1),1)))
class FinalWindow(nn.Module):
 def forward(self,pred,conf,grid):
  pred=F.grid_sample(pred,grid,mode='bilinear',padding_mode='border',align_corners=False);conf=F.grid_sample(conf,grid,mode='bilinear',padding_mode='border',align_corners=False)
  return pred.softmax(1)[:,1:2],conf.sigmoid(),pred[:,1:2]-pred[:,0:1],conf
class ImageScore(nn.Module):
 def __init__(self,layer):super().__init__();self.layer=layer
 def forward(self,stats):return self.layer(stats).sigmoid()

class Norm(nn.Module):
 def __init__(self,layer):super().__init__();self.layer=layer
 def forward(self,x):return self.layer(x.flatten(2).transpose(1,2)).transpose(1,2).reshape_as(x)
class CrossPrepare(nn.Module):
 def __init__(self,layer,act):super().__init__();self.layer=layer;self.act=act
 def forward(self,x):
  b,c,h,w=x.shape;y,u=self.act(self.layer(x.flatten(2).transpose(1,2))).chunk(2,dim=-1)
  return y.transpose(1,2).reshape(b,c,h,w),u.transpose(1,2).reshape(b,c,h,w)
class CrossApply(nn.Module):
 def __init__(self,layer,norm,heads):super().__init__();self.layer=layer;self.norm=norm;self.heads=heads
 def forward(self,x,y,u,context):
  b,c,h,w=x.shape;q=u.flatten(2).transpose(1,2).reshape(b,-1,self.heads,c//self.heads).permute(0,2,1,3)
  v=(q@context).permute(0,2,1,3).reshape(b,-1,c);value=self.norm(x.flatten(2).transpose(1,2)+self.layer(torch.cat((y.flatten(2).transpose(1,2),v),-1)))
  return value.transpose(1,2).reshape_as(x)
class CrossContextFromX(nn.Module):
 def __init__(self,layer,branch):
  super().__init__();self.prepare=CrossPrepare(getattr(layer,'channel_proj'+str(branch)),getattr(layer,'act'+str(branch)));self.context=ContextPart(getattr(layer.cross_attn,'kv'+str(branch)),layer.cross_attn.num_heads)
 def forward(self,x):
  y,u=self.prepare(x);return self.context(u)
class CrossApplyFromX(nn.Module):
 def __init__(self,layer,branch):
  super().__init__();self.prepare=CrossPrepare(getattr(layer,'channel_proj'+str(branch)),getattr(layer,'act'+str(branch)));self.finish=CrossApply(getattr(layer,'end_proj'+str(branch)),getattr(layer,'norm'+str(branch)),layer.cross_attn.num_heads)
 def forward(self,x,context):
  y,u=self.prepare(x);return self.finish(x,y,u,context)
