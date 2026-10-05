from pathlib import Path
import sys,json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning2 import polygon_mask,memberships
from gui.sherloq_app.core.cloning import pack_keypoints
from gui.sherloq_app.core.sift_g2nn import extract,_extract_global
rng=np.random.default_rng(701);image=rng.integers(0,256,(176,224,3),dtype=np.uint8);image[90:154,130:194]=image[10:74,10:74]
regions=[[[5,5],[95,5],[95,80],[5,80]],[[125,85],[215,85],[215,165],[125,165]]];excluded=[[[20,20],[40,20],[40,40],[20,40]]]
cases=[]
for family in ['ORB','AKAZE','SIFT','SIFT-G2NN','BRISK']:
 for scope in ['global','masked'] if family in ['ORB','AKAZE','SIFT-G2NN'] else ['masked']:
  rois=regions if scope=='masked' else [];exclusions=excluded if scope=='masked' else [];limit=100
  if family=='SIFT-G2NN':p,d,m,total=extract(image,limit,rois,exclusions,lambda:False)
  else:
   detector={'ORB':lambda:cv.ORB_create(nfeatures=limit),'AKAZE':cv.AKAZE_create,'SIFT':lambda:cv.SIFT_create(nfeatures=limit),'BRISK':cv.BRISK_create}[family]();kp,d=detector.detectAndCompute(cv.cvtColor(image,cv.COLOR_BGR2GRAY),polygon_mask(image.shape[:2],rois,exclusions));p=pack_keypoints(kp);total=len(p)
   if d is None:d=np.empty((0,detector.descriptorSize()),np.float32 if family=='SIFT' else np.uint8)
   ids=np.argsort(-p[:,4],kind='stable')[:limit];p=p[ids];d=d[ids];m=memberships(p,image.shape[:2],rois)
  cases.append(dict(name=family+'/'+scope,family=family,limit=limit,regions=rois,excluded=exclusions,points=p.tolist(),descriptors=d.tolist(),members=m.astype(int).tolist(),totalFeatures=total))
# Real reflected pixel extraction, local exclusions and original-coordinate map.
flipped=np.ascontiguousarray(image[:,::-1]);rois=[[(image.shape[1]-1-x,y) for x,y in poly] for poly in regions];exclusions=[[(image.shape[1]-1-x,y) for x,y in poly] for poly in excluded]
p,d,m,total=extract(flipped,100,rois,exclusions,lambda:False);p[:,0]=image.shape[1]-1-p[:,0];p[:,3]=(180-p[:,3])%360
cases.append(dict(name='SIFT-G2NN/reflected',family='SIFT-G2NN',reflected=True,limit=100,regions=regions,excluded=excluded,points=p.tolist(),descriptors=d.tolist(),members=m.astype(int).tolist(),totalFeatures=total))
out=root/'.build/m3';out.mkdir(parents=True,exist_ok=True);(out/'sparse-rgb.bin').write_bytes(image[:,:,::-1].copy().tobytes());(out/'sparse-reference.json').write_text(json.dumps(dict(width=image.shape[1],height=image.shape[0],cases=cases),separators=(',',':'))+'\n')
