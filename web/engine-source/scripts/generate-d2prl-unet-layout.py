"""Offline constant-tensor arithmetic domains for UNet grouped/strided convolutions.
No expected image activation participates; no runtime probing or calibration.
"""
from pathlib import Path
import torch,numpy as np,ctypes as C,ctypes.util,json
root=Path(__file__).resolve().parents[1];torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0' and 'BLAS_INFO=accelerate' in torch.__config__.show()
lib=C.CDLL(ctypes.util.find_library('m'));lib.fmaf.argtypes=[C.c_float,C.c_float,C.c_float];lib.fmaf.restype=C.c_float
ref=json.loads((root/'.build/d2prl-unet-convolution/reference.json').read_text());records=[]
rejected=[]
for row in ref['records']:
 if row['zeroBias']:continue
 _,channels,h,w=row['input']['shape'];oc,_,k,_=row['weights']['shape'];pad=row['padding'];stride=row['stride'];groups=row['groups'];channels//=groups;oh=(h+2*pad-k)//stride+1;ow=(w+2*pad-k)//stride+1
 ny=np.maximum(0,np.minimum(np.arange(oh)*stride-pad+k,h)-np.maximum(np.arange(oh)*stride-pad,0));nx=np.maximum(0,np.minimum(np.arange(ow)*stride-pad+k,w)-np.maximum(np.arange(ow)*stride-pad,0));counts=(ny[:,None]*nx[None,:]*channels).reshape(-1);unique=set(counts.tolist());decisions=np.full(oh*ow,-1,np.int8);probes=[]
 for v,weight,bias in [(.731,.0371,.1379),(.371,.0711,-.1739),(.913,-.0161,.1437),(.4127,-.0173,-.3151)]:
  v=np.float32(v);weight=np.float32(weight);bias=np.float32(bias);before=bias;after=np.float32(0);lookup={}
  for i in range(1,channels*k*k+1):
   before=lib.fmaf(v,weight,before);after=lib.fmaf(v,weight,after)
   if i in unique:lookup[i]=(np.float32(before),np.float32(np.float32(after)+bias))
  a=np.array([lookup[int(c)][1] for c in counts],np.float32).view(np.uint32);b=np.array([lookup[int(c)][0] for c in counts],np.float32).view(np.uint32)
  with torch.inference_mode():r=torch.nn.functional.conv2d(torch.full((1,channels*groups,h,w),float(v)),torch.full((oc,channels,k,k),float(weight)),torch.full((oc,),float(bias)),padding=pad,stride=stride,groups=groups).numpy().reshape(oc,-1)
  actual=r.view(np.uint32);unknown=np.count_nonzero((actual!=a)&(actual!=b));
  if unknown or not np.all(actual==actual[:1]):
   rejected.append(dict(name=row['name'],reason='Constant reduction outside before/after ordered FMA candidates',unknown=int(unknown)));break
  known=a!=b;observed=(actual[0]==a).astype(np.int8);assert np.all((decisions<0)|~known|(decisions==observed)),row['name'];decisions[known]=observed[known]
  probes.append(dict(inputValue=float(v),weight=float(weight),bias=float(bias),distinguishedPositions=int(known.sum())))
 if rejected and rejected[-1]['name']==row['name']:continue
 if np.any(decisions<0):
  rejected.append(dict(name=row['name'],reason='Ambiguous bias positions',unknown=int((decisions<0).sum())));continue
 edges=np.flatnonzero(np.diff(np.r_[False,decisions==1,False]));ranges=edges.reshape(-1,2).tolist();records.append(dict(name=row['name'],inputShape=row['input']['shape'],weightShape=row['weights']['shape'],padding=pad,stride=stride,groups=groups,biasAfterRanges=ranges,independentConstantProbes=probes));print(json.dumps(dict(name=row['name'],ranges=ranges)),flush=True)
(root/'fixtures/d2prl/gemm-layout-unet.json').write_text(json.dumps(dict(schema=1,scope='Fixed native UNet matrix arithmetic, independently distinguished by constant tensors including padding; no image-specific correction or runtime calibration',torch=torch.__version__,referenceTorchThreads=8,referenceBlas='Accelerate, native reference host10 CPU logical cores',records=records,rejected=rejected),indent=2)+'\n')

print('Qualified',len(records),'rejected',len(rejected),flush=True)
