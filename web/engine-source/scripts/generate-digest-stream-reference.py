"""Independent OpenCV 4.11 native reference; writes only this worktree's tests/data."""
from pathlib import Path
import json,hashlib
import cv2 as cv
import numpy as np
root=Path(__file__).resolve().parents[1];assert cv.__version__=='4.11.0'
algorithms=[('Average',cv.img_hash.averageHash),('Block mean',cv.img_hash.blockMeanHash),('Color moments',cv.img_hash.colorMomentHash),('Marr-Hildreth',cv.img_hash.marrHildrethHash),('pHash',cv.img_hash.pHash),('Radial variance',cv.img_hash.radialVarianceHash)]
cases=[]
for file in ['digest-downsample.png','digest-large.png','recompression-segmented-parallel.jpg']:
 path=root/'tests/data'/file;image=cv.imread(str(path));assert image is not None
 cases.append(dict(file=file,width=image.shape[1],height=image.shape[0],sha256=hashlib.sha256(path.read_bytes()).hexdigest(),hashes={name:fn(image).ravel().tolist() for name,fn in algorithms}))
orientations=[]
base=np.frombuffer((root/'fixtures/pixels-random-odd.rgb').read_bytes(),dtype=np.uint8).reshape(19,17,3)[:,:,::-1].copy()
for orientation,image in enumerate([base,cv.flip(base,1),cv.flip(base,-1),cv.flip(base,0),cv.transpose(base),cv.rotate(base,cv.ROTATE_90_CLOCKWISE),cv.flip(cv.transpose(base),-1),cv.rotate(base,cv.ROTATE_90_COUNTERCLOCKWISE)],1):
 orientations.append(dict(orientation=orientation,hashes={name:fn(image).ravel().tolist() for name,fn in algorithms}))
(root/'tests/data/digest-stream-native.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases,orientations=orientations),indent=2)+'\n')
