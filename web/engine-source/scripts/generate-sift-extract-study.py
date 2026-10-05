from pathlib import Path
import numpy as np,cv2 as cv,json
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';out.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(3055);cases=[]
for name,image in [('flat',np.full((24,32,3),127,np.uint8)),('texture',rng.integers(0,256,(48,64,3),dtype=np.uint8)),('texture-odd',rng.integers(0,256,(47,61,3),dtype=np.uint8))]:
 gray=cv.cvtColor(image,cv.COLOR_BGR2GRAY);gray.tofile(out/(name+'.gray'));gray=cv.normalize(gray,None,0,255,cv.NORM_MINMAX);gray.tofile(out/(name+'.normalized'));scale=4
 enlarged=cv.resize(gray,None,fx=scale,fy=scale,interpolation=cv.INTER_CUBIC)
 kp,d=cv.SIFT_create(nfeatures=400,contrastThreshold=.001).detectAndCompute(enlarged,None)
 p=np.array([[k.pt[0]/scale,k.pt[1]/scale,k.size/scale,k.angle,k.response,k.octave,k.class_id] for k in kp],np.float32).reshape(-1,7)
 if d is None:d=np.empty((0,128),np.float32)
 enlarged.tofile(out/(name+'.enlarged'));image.tofile(out/(name+'.bgr'));p.tofile(out/(name+'.points'));d.tofile(out/(name+'.desc'))
 cases.append(dict(name=name,width=image.shape[1],height=image.shape[0],limit=200,count=len(p)))
(out/'sift-extract.json').write_text(json.dumps(dict(cases=cases)))
