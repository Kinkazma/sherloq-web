"""Bound SAM global-attention temporaries without reducing its keys or layers."""
import torch,types
@torch.jit.script
def attend_rows(q:torch.Tensor,k:torch.Tensor,v:torch.Tensor,rh:torch.Tensor,rw:torch.Tensor):
 parts=torch.jit.annotate(list[torch.Tensor],[])
 for row in range(0,64,2):
  a=torch.matmul(q[:,row*64:(row+2)*64,:],k.transpose(1,2)).reshape(q.size(0),2,64,64,64)
  a=a+rh[:,row:row+2,:,:,None]+rw[:,row:row+2,:,None,:]
  parts.append(torch.matmul(a.reshape(q.size(0),128,4096).softmax(2),v))
 return torch.cat(parts,dim=1)
def bounded_forward(self,x):
 b,h,w,c=x.shape
 qkv=self.qkv(x).reshape(b,h*w,3,self.num_heads,c//self.num_heads).permute(2,0,3,1,4).reshape(3,b*self.num_heads,h*w,c//self.num_heads)
 q,k,v=qkv[0],qkv[1],qkv[2];r=q.reshape(b*self.num_heads,64,64,c//self.num_heads)
 # Fixed native 64x64 global grid: no relative-position interpolation needed.
 indices=torch.arange(64,device=x.device)[:,None]-torch.arange(64,device=x.device)[None,:]+63
 rh=torch.einsum('bhwc,hkc->bhwk',r,self.rel_pos_h[indices]);rw=torch.einsum('bhwc,wkc->bhwk',r,self.rel_pos_w[indices])
 out=attend_rows(q*self.scale,k,v,rh,rw).reshape(b,self.num_heads,64,64,c//self.num_heads).permute(0,2,3,1,4).reshape(b,64,64,c)
 return self.proj(out)
def install(encoder):
 originals=[]
 for block in encoder.blocks:
  if block.window_size==0:
   attention=block.attn;assert attention.use_rel_pos and attention.rel_pos_h.shape[0]==127
   originals.append((attention,attention.forward));attention.forward=types.MethodType(bounded_forward,attention)
 return originals
