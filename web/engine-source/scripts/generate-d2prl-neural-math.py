"""Publicable synthetic corpus for the bounded UNet composition helpers.
No model weights or private photographs are used here.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import torch
import torch.nn.functional as F
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-neural-math-corpus';out.mkdir(exist_ok=True)
torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0';rng=np.random.default_rng(924013);records=[]
def tensor(shape):return torch.from_numpy(rng.normal(0,3,shape).astype(np.float32))
def save(name,t):
 a=t.detach().contiguous().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data)
 return dict(file=file,shape=list(a.shape),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
def case(name,operation,inputs,result,attrs=None):
 prefix=str(len(records));records.append(dict(name=name,operation=operation,inputs=[save(prefix+'-input-'+str(i),t) for i,t in enumerate(inputs)],output=save(prefix+'-output',result),attributes=attrs or {}))
for n in [7,8,9,16,17,196,784]:
 a=torch.tensor([-0.,0.,-1.,1.,1e-40,-1e-40,2.,-2.]*((n+7)//8))[:n].reshape((1,1,14,14) if n==196 else (1,1,28,28) if n==784 else (1,1,1,n))
 b=torch.flip(a,[-1])
 case('relu-signed-zero-'+str(n),'Relu',[a],a.relu())
 case('maximum-signed-zero-'+str(n),'Max',[a,b],torch.maximum(a,b))
for shape in [(1,8,14,14),(1,32,28,28),(1,64,112,112)]:
 a=tensor(shape);b=tensor(shape);suffix='x'.join(map(str,shape))
 case('add-'+suffix,'Add',[a,b],a+b)
 for bshape in [(1,shape[1],1,1),(1,1,shape[2],shape[3])]:
  b=tensor(bshape);key='x'.join(map(str,bshape));case('multiply-'+suffix+'-'+key,'Mul',[a,b],a*b);case('reverse-multiply-'+suffix+'-'+key,'Mul',[b,a],b*a)
 case('nearest-'+suffix,'Nearest2',[a],F.interpolate(a,scale_factor=2,mode='nearest'))
 case('pool-'+suffix,'MaxPool',[a],F.max_pool2d(a,3,2,0,ceil_mode=True),dict(kernel_shape=[3,3],strides=[2,2],pads=[0]*4,ceil_mode=1,dilations=[1,1]))
 case('sigmoid-'+suffix,'Sigmoid',[a],a.sigmoid())
 case('mean-'+suffix,'GlobalAveragePool',[a],a.mean((2,3),keepdim=True))
 c=shape[1];mean=tensor((c,));variance=torch.abs(tensor((c,)));weight=tensor((c,));bias=tensor((c,))
 case('batchnorm-'+suffix,'BatchNormalization',[a,weight,bias,mean,variance],F.batch_norm(a,mean,variance,weight,bias,False,0.1,1e-5),dict(training_mode=0,epsilon=1e-5))
report=dict(schema=1,scope='Generated finite float32 UNet helper inputs, signed zeros, broadcast order, channelwise cancellation boundaries; no model parity claim',torch=torch.__version__,referenceThreads=8,records=records)
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Generated',len(records),'cases')
