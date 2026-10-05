from pathlib import Path
import hashlib,json,shutil
import numpy as np
import cv2 as cv
import pywt
root=Path(__file__).resolve().parents[1];out=root/'.build/blocking-large';out.mkdir(parents=True,exist_ok=True);source=root/'.build/wavelet-stream-reference/source.jpg';shutil.copyfile(source,out/'source.jpg');gray=cv.imread(str(source),cv.IMREAD_GRAYSCALE);height,width=gray.shape
a,b=pywt.dwt(gray.astype(np.float64),'db8',axis=0);a,d=pywt.dwt(b,'db8',axis=1);cases=[]
for block in [8,13]:
 h,w=[n//block for n in d.shape];noise=np.median(np.abs(d[:h*block,:w*block].reshape(h,block,w,block).transpose(0,2,1,3).copy().reshape(h,w,block*block)),axis=2)/.6745;pixels=cv.cvtColor(cv.resize(cv.normalize(noise,None,0,255,cv.NORM_MINMAX,dtype=cv.CV_8U),(width,height),interpolation=cv.INTER_NEAREST),cv.COLOR_GRAY2RGB)
 cases.append(dict(params=dict(block=block),sha256=hashlib.sha256(pixels.tobytes()).hexdigest(),noiseSha256=hashlib.sha256(noise.tobytes()).hexdigest(),rows=h,cols=w))
(out/'reference.json').write_text(json.dumps(dict(width=width,height=height,cases=cases))+'\n')
