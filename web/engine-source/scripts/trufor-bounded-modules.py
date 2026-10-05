"""Preserve pointwise projections before interpolation, retaining global coordinates."""
from typing import List
import torch
from torch import nn,Tensor
from torch.nn import functional as F
class ProjectRows(nn.Module):
 def __init__(self,projection):super().__init__();self.projection=projection
 def forward(self,feature:Tensor,lo:int,hi:int,h:int,w:int):
  fh=feature.shape[2];fw=feature.shape[3]
  start=max(0,((2*lo+1)*fh-h)//(2*h));stop=min(fh,((2*hi-1)*fh-h)//(2*h)+2)
  cropped=feature[:,:,start:stop,:];n=cropped.shape[0];ch=cropped.shape[2]
  projected=self.projection(cropped.flatten(2).transpose(1,2)).permute(0,2,1).reshape(n,-1,ch,fw)
  # Equivalent source-coordinate formula to native align_corners=False Resize.
  xs=((torch.arange(w,device=feature.device,dtype=torch.float32)+.5)*(fw/w)-.5).clamp(0.,float(fw-1))
  ys=((torch.arange(lo,hi,device=feature.device,dtype=torch.float32)+.5)*(fh/h)-.5).clamp(0.,float(fh-1))-start
  xs=(xs+.5)*(2./fw)-1.;ys=(ys+.5)*(2./ch)-1.
  gy,gx=torch.meshgrid([ys,xs],indexing='ij');grid=torch.stack([gx,gy],-1)[None].expand(n,-1,-1,-1)
  return F.grid_sample(projected,grid,mode='bilinear',padding_mode='border',align_corners=False)
class HeadRows(nn.Module):
 def __init__(self,head):
  super().__init__();self.projects=nn.ModuleList([ProjectRows(head.linear_c4.proj),ProjectRows(head.linear_c3.proj),ProjectRows(head.linear_c2.proj)]);self.c1=head.linear_c1.proj;self.fuse=head.linear_fuse;self.pred=head.linear_pred
 def forward(self,c1:Tensor,c2:Tensor,c3:Tensor,c4:Tensor,row_budget:Tensor):
  h=c1.shape[2];w=c1.shape[3];n=c1.shape[0];features=[c4,c3,c2];outputs=torch.jit.annotate(List[Tensor],[])
  rows=max(1,int(row_budget)//(w*512*4*12));lo=0
  while lo<h:
   hi=min(lo+rows,h);parts=torch.jit.annotate(List[Tensor],[])
   for i,project in enumerate(self.projects):parts.append(project(features[i],lo,hi,h,w))
   cropped=c1[:,:,lo:hi,:];parts.append(self.c1(cropped.flatten(2).transpose(1,2)).permute(0,2,1).reshape(n,-1,hi-lo,w))
   outputs.append(self.pred(self.fuse(torch.cat(parts,1))));lo=hi
  return torch.cat(outputs,dim=2)
