"""Public synthetic native depthwise cases for the portable CMSeg helper."""
from pathlib import Path
import json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'fixtures/cmseg-winograd';out.mkdir(exist_ok=True);torch.set_num_threads(8);rng=np.random.default_rng(280512);rows=[]
def save(name,a):
    a=np.ascontiguousarray(a,dtype=np.float32);b=a.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,bytes=len(b),shape=list(a.shape),sha256=hashlib.sha256(b).hexdigest())
with torch.inference_mode():
    for index,(c,h,w,pad,biased) in enumerate([(1,3,3,0,False),(3,5,7,1,True),(2,13,17,0,True),(3,13,17,1,False),(4,16,16,1,True),(3,32,32,1,False),(2,64,64,1,True),(2,128,128,1,False),(1,256,256,1,False)]):
        x=rng.normal(0,1,(1,c,h,w)).astype(np.float32);weight=rng.normal(0,.25,(c,1,3,3)).astype(np.float32);bias=rng.normal(0,.1,c).astype(np.float32) if biased else np.zeros(c,np.float32)
        y=torch.nn.functional.conv2d(torch.from_numpy(x),torch.from_numpy(weight),torch.from_numpy(bias) if biased else None,padding=pad,groups=c).numpy()
        rows.append(dict(name=str(index),channels=c,height=h,width=w,padding=pad,biased=biased,input=save(str(index)+'-input',x),weight=save(str(index)+'-weights',weight),bias=save(str(index)+'-bias',bias),output=save(str(index)+'-output',y)))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Seeded finite float32 native depthwise3x3 stride1, borders/odd sizes and optional bias; independent of private model activations.',torch=torch.__version__,seed=280512,records=rows),indent=2)+'\n')
print('Native Winograd cases',len(rows))
