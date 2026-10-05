"""Scripted versions of the native row bounds; the model's weights stay shared."""
from typing import List
import torch
from torch import nn,Tensor
from torch.nn import functional as F
class DctRows(nn.Module):
 def __init__(self,first,tail):super().__init__();self.first=first;self.tail=tail
 def forward(self,coeff:Tensor):
  height=coeff.shape[-2];parts=torch.jit.annotate(List[Tensor],[]);y=0
  while y<height:
   end=min(y+128,height);lo=max(0,y-8);hi=min(height,end+8)
   part=self.tail(self.first(coeff[:,:,lo:hi]));parts.append(part[:,:,y-lo:end-lo]);y=end
  return torch.cat(parts,dim=2)
class HeadRows(nn.Module):
 def __init__(self,head):super().__init__();self.head=head
 def forward(self,f0:Tensor,f1:Tensor,f2:Tensor,f3:Tensor):
  features=[f0,f1,f2,f3]
  h=features[0].shape[-2];w=features[0].shape[-1];outputs=torch.jit.annotate(List[Tensor],[])
  xs=(torch.arange(w,device=features[0].device,dtype=torch.float32)+.5)*(2./w)-1.;lo=0
  while lo<h:
   hi=min(lo+32,h);ys=(torch.arange(lo,hi,device=features[0].device,dtype=torch.float32)+.5)*(2./h)-1.
   gy,gx=torch.meshgrid([ys,xs],indexing='ij');grid=torch.stack([gx,gy],-1)[None].expand(features[0].shape[0],-1,-1,-1)
   parts=torch.jit.annotate(List[Tensor],[]);parts.append(features[0][:,:,lo:hi])
   for f in features[1:]:
    fh=f.shape[-2];fw=f.shape[-1]
    bounded_grid=torch.stack([grid[...,0].clamp(-1.+1./fw,1.-1./fw),grid[...,1].clamp(-1.+1./fh,1.-1./fh)],-1)
    parts.append(F.grid_sample(f,bounded_grid,mode='bilinear',padding_mode='zeros',align_corners=False))
   outputs.append(self.head(torch.cat(parts,1)));lo=hi
  return torch.cat(outputs,dim=2)
class DctCodesRows(nn.Module):
 def __init__(self,first,tail):super().__init__();self.first=first;self.tail=tail;self.register_buffer('categories',torch.arange(21,dtype=torch.uint8).view(1,21,1,1))
 def forward(self,codes:Tensor,row_budget:Tensor):
  height=codes.shape[-2];width=codes.shape[-1];parts=torch.jit.annotate(List[Tensor],[]);y=0;rows=max(1,int(row_budget)//(width*512)-16)
  while y<height:
   end=min(y+rows,height);lo=max(0,y-8);hi=min(height,end+8)
   volume=(codes[:,:,lo:hi,:]==self.categories).to(torch.float32)
   part=self.tail(self.first(volume));parts.append(part[:,:,y-lo:end-lo]);y=end
  return torch.cat(parts,dim=2)
