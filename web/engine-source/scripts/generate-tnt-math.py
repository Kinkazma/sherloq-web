"""Public seeded TNT operation references, independent of model activations."""
from pathlib import Path
import json,hashlib
import numpy as np
import torch
root=Path(__file__).resolve().parents[1];out=root/'fixtures/tnt-math';out.mkdir(exist_ok=True);torch.set_num_threads(8);records=[]
def values(shape,seed):
    a=np.empty(int(np.prod(shape)),np.float32);state=seed
    for i in range(a.size):state=(1664525*state+1013904223)&0xffffffff;a[i]=((state>>8)-8388608)/8388608
    return a.reshape(shape)
def saved(name,a):
    a=np.ascontiguousarray(a,np.float32);b=a.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,shape=list(a.shape),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
with torch.inference_mode():
    x=values((1,3,256,256),941);weight=values((40,3,7,7),942);bias=values((40,),943)
    patches=torch.nn.functional.unfold(torch.from_numpy(x),kernel_size=16,stride=16).transpose(1,2).reshape(256,3,16,16)
    output=torch.nn.functional.conv2d(patches,torch.from_numpy(weight),torch.from_numpy(bias),stride=4,padding=3).reshape(256,40,16).transpose(1,2)
    records.append(dict(kind='patch',output=saved('patch',output.numpy())))
    for i,(rows,ci,co,bias) in enumerate([(4096,40,40,True),(4096,160,40,True),(256,640,640,True),(257,640,1280,False),(257,2560,640,True)]):
        x=values((rows,ci),301+i*3);w=values((co,ci),302+i*3);b=values((co,),303+i*3)
        y=torch.nn.functional.linear(torch.from_numpy(x),torch.from_numpy(w),torch.from_numpy(b) if bias else None)
        records.append(dict(kind='linear',rows=rows,ci=ci,co=co,bias=bias,seed=301+i*3,output=saved('linear-'+str(i),y.numpy())))
    for width in [40,640]:
        x=values((8,width),901);x[1]+=1000;x[2]=.125;x[3]*=1e-12;gamma=values((width,),902);beta=values((width,),903)
        y=torch.nn.functional.layer_norm(torch.from_numpy(x),[width],torch.from_numpy(gamma),torch.from_numpy(beta),1e-5)
        records.append(dict(kind='norm',width=width,rows=8,output=saved('norm-'+str(width),y.numpy())))
    for batch,heads,n,d in [(256,4,16,10),(1,10,257,64)]:
        # Preserve the actual qkv strides: native BLAS dispatch is layout-sensitive.
        qk=torch.from_numpy(values((batch,n,2,heads,d),911)).permute(2,0,3,1,4);q,k=qk[0],qk[1]
        v=torch.from_numpy(values((batch,n,heads,d),913)).permute(0,2,1,3)
        scores=q@k.transpose(-2,-1);scaled=scores*(d**-.5);p=scaled.softmax(dim=-1);context=p@v
        records.append(dict(kind='attention',batch=batch,heads=heads,n=n,d=d,scores=saved('scores-'+str(n),scores.numpy()),scaled=saved('scaled-'+str(n),scaled.numpy()),probability=saved('probability-'+str(n),p.numpy()),context=saved('context-'+str(n),context.numpy())))
    x=values((16384,),930)*np.float32(12);x[:8]=[0.,-0.,1e-20,-1e-20,1e10,-1e10,1e-6,-1e-6]
    y=torch.nn.functional.gelu(torch.from_numpy(x),approximate='none')
    records.append(dict(kind='gelu',elements=x.size,output=saved('gelu',y.numpy())))
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='LCG1664525/1013904223 seeded public floats; native operation references, no checkpoint or image data.',torch=torch.__version__,records=records),indent=2)+'\n');print('Public TNT fixtures',len(records),flush=True)
