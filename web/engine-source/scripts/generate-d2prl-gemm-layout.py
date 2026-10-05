"""Offline native arithmetic qualification, never a runtime calibration.
Constant tensors independently identify bias-before/after reduction ranges for
fixed D2PRL convolution shapes. No image, checkpoint or model output is copied.
The declared native PyTorch2.8/Accelerate reference is required for regeneration.
"""
from pathlib import Path
import torch,numpy as np,ctypes as C,ctypes.util,json,argparse
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--all-scales',action='store_true');args=parser.parse_args();torch.set_num_threads(8);assert torch.__version__.split('+')[0]=='2.8.0' and 'BLAS_INFO=accelerate' in torch.__config__.show()
lib=C.CDLL(ctypes.util.find_library('m'));lib.fmaf.argtypes=[C.c_float,C.c_float,C.c_float];lib.fmaf.restype=C.c_float
base=root/'.build/d2prl-convolution';ref=json.loads((base/('all-reference.json' if args.all_scales else 'reference.json')).read_text());records=[]
for row in ref['records']:
 if row['padding']:continue
 _,channels,h,w=row['input']['shape'];oc,_,k,_=row['weights']['shape'];count=channels*k*k;m=(h-k+1)*(w-k+1);ranges=None;probes=[]
 for v,weight,bias in [(.731,.0371,.1379),(.371,.0711,-.1739),(.913,-.0161,.1437)]:
  v=np.float32(v);weight=np.float32(weight);bias=np.float32(bias);before=bias;after=np.float32(0)
  for i in range(count):before=lib.fmaf(v,weight,before);after=lib.fmaf(v,weight,after)
  before=np.float32(before);after=np.float32(np.float32(after)+bias)
  if before==after:continue
  with torch.inference_mode():r=torch.nn.functional.conv2d(torch.full((1,channels,h,w),float(v)),torch.full((oc,channels,k,k),float(weight)),torch.full((oc,),float(bias))).numpy().reshape(oc,m)
  actual=r.view(np.uint32);b=before.view(np.uint32);a=after.view(np.uint32);unknown=np.count_nonzero((actual!=b)&(actual!=a));shared=np.all(actual==actual[:1]);assert unknown==0 and shared,(row['name'],unknown,shared)
  mask=actual[0]==a;edges=np.flatnonzero(np.diff(np.r_[False,mask,False]));observed=edges.reshape(-1,2).tolist()
  if ranges is None:ranges=observed
  assert observed==ranges,(row['name'],observed,ranges)
  probes.append(dict(inputValue=float(v),weight=float(weight),bias=float(bias),before=float(before),after=float(after)))
 assert ranges is not None,row['name'];record=dict(name=row['name'],inputShape=row['input']['shape'],weightShape=row['weights']['shape'],padding=row['padding'],biasAfterRanges=ranges,independentConstantProbes=probes);records.append(record);print(json.dumps(dict(name=row['name'],ranges=ranges,probes=len(probes))),flush=True)
report=dict(schema=1,scope='Fixed model-matrix arithmetic domains, independently probed with constant tensors. No image-specific correction or browser calibration.',torch=torch.__version__,referenceTorchThreads=8,referenceBlas='Accelerate, native reference host10 CPU logical cores',records=records);dest=root/'fixtures/d2prl'/('gemm-layout-all.json' if args.all_scales else 'gemm-layout.json');dest.write_text(json.dumps(report,indent=2)+'\n')
