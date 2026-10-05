from pathlib import Path
import numpy as np
import cv2 as cv
import json,ctypes
root=Path(__file__).resolve().parents[1];out=root/'.build/digest-extra';out.mkdir(parents=True,exist_ok=True);reference=json.loads((root/'fixtures/image-hash-reference.json').read_text());cases=[]
expf=ctypes.CDLL(None).expf;expf.argtypes=[ctypes.c_float];expf.restype=ctypes.c_float
kernel=np.array([[np.float32((2-np.float32(((x-8)*.5)**2+((y-8)*.5)**2))*expf((((x-8)*.5)**2+((y-8)*.5)**2)/2)) for x in range(17)]for y in range(17)],np.float32)
for index,item in enumerate(reference['cases']):
 rgb=np.frombuffer((root/'fixtures'/item['file']).read_bytes(),np.uint8).reshape(item['height'],item['width'],3);image=np.ascontiguousarray(rgb[:,:,::-1]);color=cv.resize(image,(512,512),interpolation=cv.INTER_CUBIC);blur=cv.GaussianBlur(color,(3,3),0);hsv=cv.cvtColor(blur,cv.COLOR_BGR2HSV);ycc=cv.cvtColor(blur,cv.COLOR_BGR2YCrCb);hu=np.concatenate([cv.HuMoments(cv.moments(c)).ravel()for c in cv.split(hsv)+cv.split(ycc)])
 gray=cv.cvtColor(image,cv.COLOR_BGR2GRAY);smoothed=cv.GaussianBlur(gray,(7,7),0);resized=cv.resize(smoothed,(512,512),interpolation=cv.INTER_CUBIC);equalized=cv.equalizeHist(resized);frequency=cv.filter2D(equalized,cv.CV_32F,kernel);blocks=np.array([[cv.sumElems(frequency[x*16:x*16+16,y*16:y*16+16])[0]for x in range(31)]for y in range(31)],np.float32)
 arrays={2:[color,blur,hsv,ycc,hu],3:[gray,smoothed,resized,equalized,frequency,blocks,cv.img_hash.marrHildrethHash(image),kernel]};stages=[]
 for kind,values in arrays.items():
  for stage,value in enumerate(values):
   name=f'{index}-{kind}-{stage}.bin';(out/name).write_bytes(value.tobytes());stages.append(dict(kind=kind,stage=stage,file=name,dtype=value.dtype.str))
 assert np.array_equal(hu,cv.img_hash.colorMomentHash(image).ravel())
 cases.append(dict(**item,stages=stages))
(out/'reference.json').write_text(json.dumps(cases))
