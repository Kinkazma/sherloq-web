from pathlib import Path
import json,io
import numpy as np
import cv2 as cv
from PIL import Image
import pywt
out=Path(__file__).resolve().parents[1]/'.build/blocking-stream';out.mkdir(parents=True,exist_ok=True);records=[]
rng=np.random.default_rng(996)
for orientation,progressive in [(1,False),(6,False),(8,True)]:
 rgb=rng.integers(0,256,(97,113,3),dtype=np.uint8);im=Image.fromarray(rgb);exif=Image.Exif();exif[274]=orientation;file=f'{orientation}.jpg';im.save(out/file,quality=91,exif=exif,progressive=progressive)
 gray=cv.imread(str(out/file),cv.IMREAD_GRAYSCALE);loaded=cv.imread(str(out/file));h,w=gray.shape;gray.tofile(out/f'{orientation}.gray');loaded[:,:,::-1].copy().tofile(out/f'{orientation}.rgb');a,b=pywt.dwt(gray.astype(np.float64),'db8',axis=0);a,d=pywt.dwt(b,'db8',axis=1)
 for block in [1,2,8,32]:
  nh,nw=[n//block for n in d.shape];noise=np.median(np.abs(d[:nh*block,:nw*block].reshape(nh,block,nw,block).transpose(0,2,1,3).copy().reshape(nh,nw,block*block)),axis=2)/.6745
  pixels=cv.cvtColor(cv.resize(cv.normalize(noise,None,0,255,cv.NORM_MINMAX,dtype=cv.CV_8U),(w,h),interpolation=cv.INTER_NEAREST),cv.COLOR_GRAY2RGB);stem=f'{orientation}-{block}';noise.tofile(out/(stem+'.noise'));pixels.tofile(out/(stem+'.rgb'));records.append(dict(file=file,orientation=orientation,block=block,width=w,height=h,rows=nh,cols=nw,stem=stem))
(out/'manifest.json').write_text(json.dumps(records)+'\n')
