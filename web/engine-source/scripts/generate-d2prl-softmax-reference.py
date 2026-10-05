"""Public generated numerical fixtures, no weights/images or runtime calibration."""
from pathlib import Path
import gzip,hashlib,json
import torch,numpy as np
root=Path(__file__).resolve().parents[1];out=root/'fixtures/d2prl';out.mkdir(exist_ok=True)
assert torch.__version__.split('+')[0]=='2.8.0'
torch.set_num_threads(2);rng=np.random.default_rng(290009);payload=bytearray()
def array(a):
 a=np.ascontiguousarray(a);part=dict(offset=len(payload),length=a.nbytes,dtype=str(a.dtype),shape=list(a.shape));payload.extend(a.tobytes());return part
bits=rng.integers(0,0x42d00001,1048576,dtype=np.uint32);x=-bits.view(np.float32)
a=rng.integers(0,0x7c00,2097152,dtype=np.uint16).view(np.float16).astype(np.float32).reshape(2,-1)
diff=-np.abs(a[0]-a[1]);edge=np.array([0,-0.,-2.375,-6.5,-7.5,-104,np.nextafter(np.float32(-104),np.float32(-np.inf)),np.nextafter(np.float32(-104),np.float32(0))],np.float32)
x=np.concatenate([x,diff,edge]);pad=(-x.size)%8;x=np.concatenate([x,np.zeros(pad,np.float32)])
with torch.inference_mode():y=torch.exp(torch.from_numpy(x)).numpy()
exponential=dict(input=array(x),output=array(y),count=x.size)
records=[];count=65536
for k in [1,2,3,5,8,9,13]:
 logits=rng.uniform(-64,0,(1,k,count)).astype(np.float32)
 logits[:,:,count//4:count//2]=rng.uniform(-2**-8,0,(1,k,count//4))
 logits[:,:,count//2:3*count//4]=rng.uniform(-.3,-.1,(1,k,count//4)).astype(np.float16).astype(np.float32)*1000
 logits[:,:,3*count//4:]=rng.integers(-7,1,(1,k,count//4))*.125
 logits=logits.astype(np.float16)
 with torch.inference_mode():weights=torch.softmax(torch.from_numpy(logits),dim=1).numpy()
 records.append(dict(candidates=k,count=count,input=array(logits.astype(np.float32)),output=array(weights.astype(np.float32))))
raw=bytes(payload);compressed=gzip.compress(raw,mtime=0);(out/'softmax.bin.gz').write_bytes(compressed)
report=dict(schema=1,scope='Generated scalar exponential and non-last-dimension half-softmax tensor references; no full model or final masks',seed=290009,torch=torch.__version__,numpy=np.__version__,threads=2,layout='Each65536-element spatial plane and both native thread chunks align to8 half lanes; scalar tails are not qualified by this corpus',exponential=exponential,softmax=records,payload=dict(file='softmax.bin.gz',bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),compressedBytes=len(compressed),compressedSha256=hashlib.sha256(compressed).hexdigest()))
(out/'softmax.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(exponentials=x.size,softmaxDistributions=len(records)*count,bytes=len(compressed))))
