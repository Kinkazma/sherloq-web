"""Reference float32 filters, multiscale derivatives and pyramid reduction."""
from pathlib import Path
import hashlib,json
import cv2 as cv
import numpy as np
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4'
root=Path(__file__).resolve().parents[1];base=root/'.build/cloning-study';out=root/'.build/akaze-primitives-study';out.mkdir(exist_ok=True)
ref=json.loads((base/'reference.json').read_text());images=[];records=[];f=np.float32
for entry in ref['images']:
    a=np.fromfile(base/entry['gray'],np.uint8).reshape(entry['height'],entry['width']).astype(np.float32)*f(1/255.)
    images.append((entry['name'],a))
rng=np.random.default_rng(260003)
for width in range(7,24):images.append(('signed-'+str(width),rng.uniform(-3,3,(43,width)).astype(np.float32)))
def kernels(scale,dx,dy):
    if scale==1:return cv.getDerivKernels(dx,dy,0,normalize=True,ktype=cv.CV_32F)
    n=2*scale+1;w=f(10)/f(3);norm=f(1)/f(f(f(2)*f(scale))*f(w+f(2)));result=[]
    for order in [dx,dy]:
        k=np.zeros(n,np.float32)
        if order==0:k[0]=norm;k[scale]=f(w*norm);k[-1]=norm
        else:k[0]=-1;k[-1]=1
        result.append(k)
    return result
for i,(name,a) in enumerate(images):
    file=str(i)+'.f32';a.astype('<f4').tofile(out/file);results=[]
    for operation in range(13):
        if operation<2:
            n,sigma=(9,float(f(1.6))) if operation==0 else (5,1.)
            b=cv.GaussianBlur(a,(n,n),sigma,borderType=cv.BORDER_REPLICATE)
        elif operation<4:b=cv.Scharr(a,cv.CV_32F,int(operation==2),int(operation==3),borderType=cv.BORDER_DEFAULT)
        elif operation<12:
            scale=(operation-4)//2+1;dx=int(operation%2==0);kx,ky=kernels(scale,dx,1-dx)
            b=cv.sepFilter2D(a,cv.CV_32F,kx,ky,borderType=cv.BORDER_DEFAULT)
        else:b=cv.resize(a,(a.shape[1]//2,a.shape[0]//2),interpolation=cv.INTER_AREA)
        output=str(i)+'-'+str(operation)+'.f32';raw=b.astype('<f4').tobytes();(out/output).write_bytes(raw)
        results.append(dict(operation=operation,file=output,width=b.shape[1],height=b.shape[0],sha256=hashlib.sha256(raw).hexdigest()))
    records.append(dict(name=name,width=a.shape[1],height=a.shape[0],file=file,sha256=hashlib.sha256((out/file).read_bytes()).hexdigest(),results=results))
(out/'reference.json').write_text(json.dumps(dict(schema=1,numpy=np.__version__,opencv=cv.__version__,seed=260003,images=records),indent=2)+'\n')
print(len(records)*13,'native primitive cases')
