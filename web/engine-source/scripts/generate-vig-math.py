"""Public deterministic arithmetic fixtures, independent of images/checkpoints."""
from pathlib import Path
import ctypes,hashlib,json,struct,sys
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'fixtures/vig-math';out.mkdir(exist_ok=True);torch.set_num_threads(8)
records=[]
def seeded(n,seed):
 a=np.empty(n,np.float32);state=seed
 for i in range(n):state=(1664525*state+1013904223)&0xffffffff;a[i]=((state>>8)-8388608)/8388608
 return a

def save(name,a):
 a=np.ascontiguousarray(a.detach().numpy() if isinstance(a,torch.Tensor) else a);data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),shape=list(a.shape),dtype=str(a.dtype))
# Exact system expf reference is generated locally. No native code is exported.
lib=ctypes.CDLL(None);exp=lib.expf;exp.argtypes=[ctypes.c_float];exp.restype=ctypes.c_float
n=524288;a=seeded(n,721);a=np.float32((a+np.float32(1))*np.float32(-64));state=913
for i in range(n//2):
 state=(1664525*state+1013904223)&0xffffffff;a[i]=struct.unpack('<f',struct.pack('<I',0x80000000|(state%0x43000001)))[0]
a[:8]=[0.,-0.,-128.,-129.,-1e-30,-103.97208,-87.33655,-1.]
y=np.array([exp(float(v)) for v in a],np.float32);records.append(dict(kind='exp',elements=n,seed=721,bitSeed=913,output=save('exp',y)))
a=seeded(262144,731)*np.float32(12);a[:8]=[0.,-0.,1e-20,-1e-20,1e10,-1e10,1e-6,-1e-6]
with torch.inference_mode():y=torch.nn.functional.gelu(torch.from_numpy(a))
records.append(dict(kind='gelu',elements=len(a),seed=731,output=save('gelu',y)))
for name,shape,co,k,pad,stride,groups,seed in [('stem',[1,3,256,256],80,3,1,2,1,741),('grouped',[1,1280,16,16],1280,1,0,1,4,751),('ffn',[1,640,16,16],2560,1,0,1,1,761)]:
 ci=shape[1];x=torch.from_numpy(seeded(np.prod(shape),seed).reshape(shape));w=torch.from_numpy(seeded(co*ci//groups*k*k,seed+1).reshape(co,ci//groups,k,k));b=torch.from_numpy(seeded(co,seed+2))
 with torch.inference_mode():y=torch.nn.functional.conv2d(x,w,b,stride,pad,groups=groups)
 records.append(dict(kind='conv',name=name,geometry=[ci,shape[2],shape[3],co,k,pad,stride,groups],seed=seed,output=save('conv-'+name,y)))
for name,seed,k,dilation in [('random',771,18,4),('ties',781,15,3)]:
 x=seeded(640*256,seed).reshape(1,640,256,1)
 if name=='ties':
  for i in range(0,256,4):x[:,:,i:i+4,:]=x[:,:,i:i+1,:]
 x=torch.from_numpy(x)
 with torch.inference_mode():
  norm=torch.nn.functional.normalize(x,p=2,dim=1);xt=norm.transpose(2,1).squeeze(-1);sq=torch.sum(xt*xt,dim=-1,keepdim=True);distance=-(sq+(-2*torch.matmul(xt,xt.transpose(2,1)))+sq.transpose(2,1));idx=torch.topk(distance,k=k*dilation).indices;selected=idx[:,:,::dilation]
  features=x.reshape(640,256);neighbours=features[:,selected[0]];maximum=torch.max(neighbours-features[:,:,None],dim=-1).values;gather=torch.stack([features,maximum],dim=1).reshape(1280,256)
 records.append(dict(kind='graph',name=name,seed=seed,k=k,dilation=dilation,normal=save(name+'-normal',norm),distance=save(name+'-distance',distance),indices=save(name+'-indices',idx.to(torch.int32)),gather=save(name+'-gather',gather)))
report=dict(schema=1,scope='Generated LCG values only; no checkpoint, captured model activations or image.',reference=dict(torch=torch.__version__,threads=8,exp='local reference expf; pinned 128-bin quadratic arithmetic is qualified on this corpus'),records=records)
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print(len(records),'independent arithmetic cases')
