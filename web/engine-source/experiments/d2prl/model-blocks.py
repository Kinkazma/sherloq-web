"""Offline conversion boundaries for the unchanged released D2PRL model.
Numerical qualification is mandatory before these graphs can be used at runtime.
"""
import torch
import torch.nn.functional as F

class Descriptors(torch.nn.Module):
 def __init__(self, model):
  super().__init__();self.zm=model.ZM_conv;self.cnn=model.head_mask
 def forward(self,x):
  h,w=x.shape[-2:];small=F.interpolate(x,size=(int(h//1.5),int(w//1.5)),mode='bilinear',align_corners=True);large=F.interpolate(x,size=(int(h//.75),int(w//.75)),mode='bilinear',align_corners=True)
  zm=[];cnn=[]
  for value in [large,x,small]:
   a=self.zm(value);b=self.cnn(F.pad(value,[7,7,7,7],mode='reflect'))
   # The centre planes already have h,w; avoid introducing a new resize there.
   if value is not x:a=F.interpolate(a,size=(h,w),mode='bilinear',align_corners=True);b=F.interpolate(b,size=(h,w),mode='bilinear',align_corners=True)
   zm.append(a);cnn.append(b)
  return torch.cat(zm,dim=1),torch.cat(cnn,dim=1)

class Heads(torch.nn.Module):
 def __init__(self,model):
  super().__init__()
  for name in ['DLFerror7','DLFerror9','DLFerror11','last_mask','unet','head_mask2','head_mask3','head_mask4','last_mask2']:setattr(self,name,getattr(model,name))
 def forward(self,x,xoff,yoff,xoff2,yoff2,x_cor,y_cor,x_cor2,y_cor2,dlf_scores=None):
  h,w=x.shape[-2:];zm=torch.cat([x_cor,y_cor],dim=1);cnn=torch.cat([x_cor2,y_cor2],dim=1)
  if dlf_scores is None:
   x3=self.DLFerror7(zm);x4=self.DLFerror7(cnn);x5=self.DLFerror9(zm);x6=self.DLFerror9(cnn);x7=self.DLFerror11(zm);x8=self.DLFerror11(cnn)
   x3=2*torch.sigmoid(1/(x3+1e-10))-1;x4=2*torch.sigmoid(1/(x4+1e-10))-1;x5=2*torch.sigmoid(1/(x5+1e-10))-1;x6=2*torch.sigmoid(1/(x6+1e-10))-1;x7=2*torch.sigmoid(1/(x7+1e-10))-1;x8=2*torch.sigmoid(1/(x8+1e-10))-1
  else:x3,x4,x5,x6,x7,x8=dlf_scores
  xc=torch.cat([xoff,yoff,x3,x5,x7,xoff2,yoff2,x4,x6,x8],dim=1);out1=self.last_mask(xc);out9=self.unet(x)
  # Tensor condition stays dynamic in ONNX; Python tracing an if would freeze it.
  out111=torch.where(torch.sum(out1*out9)>torch.sum(out9)*.5,torch.where(out1>out9,out1,out9),out1)
  out11=out111.round();x11=self.head_mask2(x);x12=self.head_mask3(x11);x13=self.head_mask4(x12)
  x_cor=(x_cor-(w-1)/2)/((w-1)/2);y_cor=(y_cor-(h-1)/2)/((h-1)/2);x_cor2=(x_cor2-(w-1)/2)/((w-1)/2);y_cor2=(y_cor2-(h-1)/2)/((h-1)/2)
  def samples(a,b):return torch.cat([a.unsqueeze(4),b.unsqueeze(4)],dim=4).view(1,a.shape[-2],a.shape[-1],2)
  cor1=F.grid_sample(out11,samples(x_cor,y_cor),align_corners=True);cor1m=out11*cor1;cor2m=1-cor1m;xcor3=x_cor2*cor1m.round()+x_cor*cor2m.round();ycor3=y_cor2*cor1m.round()+y_cor*cor2m.round()
  size=x13.shape[-2:]
  def resize(value):return F.interpolate(value,size=size,mode='bilinear',align_corners=True)
  out22=resize(out11);out21=out22.round();a=resize(x_cor);b=resize(y_cor);c=resize(x_cor2);d=resize(y_cor2);e=resize(xcor3);f=resize(ycor3)
  x112=torch.cat([resize(x11),resize(x12),x13],dim=1);x113=F.grid_sample(x112,samples(a,b),align_corners=True);x114=F.grid_sample(x112,samples(c,d),align_corners=True)
  out3=self.last_mask2(torch.cat([x112*out22,x113*out22,x114*out22],dim=1));out3=out3*out21+(1-out21)*.5;out31=F.grid_sample(out3,samples(e,f),align_corners=True)
  out4=F.interpolate(out3,size=(h,w),mode='bilinear',align_corners=True);out41=F.interpolate(out31,size=(h,w),mode='bilinear',align_corners=True);out5=out4-out41;residual=out5*out11
  return out111,-torch.where(residual>0,torch.zeros_like(residual),residual),torch.where(residual<0,torch.zeros_like(residual),residual)

class DlfStudy(torch.nn.Module):
 def __init__(self,model):
  super().__init__();self.layers=torch.nn.ModuleList([model.DLFerror7,model.DLFerror9,model.DLFerror11])
 def forward(self,x_cor,y_cor,x_cor2,y_cor2):
  zm=torch.cat([x_cor,y_cor],dim=1);cnn=torch.cat([x_cor2,y_cor2],dim=1)
  values=[layer(pair) for layer in self.layers for pair in [zm,cnn]]
  return tuple(values+[2*torch.sigmoid(1/(v+1e-10))-1 for v in values])

class HeadsExactDlf(Heads):
 def forward(self,x,xoff,yoff,xoff2,yoff2,x_cor,y_cor,x_cor2,y_cor2,s7_zm,s7_cnn,s9_zm,s9_cnn,s11_zm,s11_cnn):
  return super().forward(x,xoff,yoff,xoff2,yoff2,x_cor,y_cor,x_cor2,y_cor2,dlf_scores=(s7_zm,s7_cnn,s9_zm,s9_cnn,s11_zm,s11_cnn))
