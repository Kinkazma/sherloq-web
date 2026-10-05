"""Expand BRISK detectAndCompute only: sizes, textures, masks and rotated copies."""
from pathlib import Path
import argparse,json,hashlib
import cv2 as cv
import numpy as np
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4'
parser=argparse.ArgumentParser();parser.add_argument('--algorithm',choices=['brisk','akaze'],default='brisk');args=parser.parse_args()
algorithm=0 if args.algorithm=='brisk' else 2
root=Path(__file__).resolve().parents[1];base=root/'.build/cloning-study';out=root/('.build/'+args.algorithm+'-expanded-study');out.mkdir(exist_ok=True)
reference=json.loads((base/'reference.json').read_text());images=[]
for entry in reference['images']:
    images.append((entry['name'],np.fromfile(base/entry['gray'],np.uint8).reshape(entry['height'],entry['width'])))
rng=np.random.default_rng(260002)
for i,(width,height) in enumerate([(31,67),(67,31),(97,101),(257,263),(513,509),(1024,129),(129,1024),(1033,1025)]):
    a=rng.integers(0,256,(height,width),np.uint8)
    if i%3==1: a=cv.GaussianBlur(a,(5,5),.7)
    if i%3==2: a=(a>127).astype(np.uint8)*255
    images.append(('extra-'+str(i),a))
    side=min(width,height)//3
    b=a.copy();b[-side-3:-3,-side-3:-3]=np.rot90(a[3:3+side,3:3+side])
    images.append(('extra-rotated-'+str(i),b))
records=[]
detector=cv.BRISK_create() if algorithm==0 else cv.AKAZE_create()
for i,(name,a) in enumerate(images):
    h,w=a.shape;gray=str(i)+'.gray';a.tofile(out/gray)
    rgb=str(i)+'.rgb';cv.cvtColor(a,cv.COLOR_GRAY2RGB).tofile(out/rgb)
    half=np.zeros((h,w),np.uint8);half[:,:w//2]=1
    sparse=np.zeros((h,w),np.uint8);sparse[::2,1::3]=1
    masks=[('all',None),('empty',np.zeros_like(a)),('half',half),('sparse',sparse)]
    results=[]
    for mask_name,mask in masks:
        prefix=str(i)+'-'+mask_name;mask_file=prefix+'.mask' if mask is not None else None
        if mask is not None:mask.tofile(out/mask_file)
        points,desc=detector.detectAndCompute(a,mask)
        packed=np.array([(p.pt[0],p.pt[1],p.size,p.angle,p.response,p.octave,p.class_id) for p in points],dtype='<f8').reshape(-1,7)
        if desc is None:desc=np.empty((0,detector.descriptorSize()),np.uint8)
        packed.tofile(out/(prefix+'.f64'));desc.tofile(out/(prefix+'.desc'))
        results.append(dict(algorithm=algorithm,mask=mask_name,maskFile=mask_file,count=len(points),descriptorSize=desc.shape[1],points=prefix+'.f64',descriptors=prefix+'.desc'))
    records.append(dict(name=name,width=w,height=h,gray=gray,rgb=rgb,graySha256=hashlib.sha256(a.tobytes()).hexdigest(),results=results))
source=root.parent/'source/gui/sherloq_app/core/cloning.py'
(out/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv.__version__,seed=260002,images=records),indent=2)+'\n')
print(len(records),'images',sum(len(r['results']) for r in records),'detector cases')
