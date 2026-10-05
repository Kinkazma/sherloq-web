"""Public synthetic image hashes from the native OpenCV algorithms."""
from pathlib import Path
import json
import numpy as np
import cv2 as cv
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'web-engine/fixtures';cases=[]
for f in json.loads((OUT/'pixel-reference.json').read_text())['cases']:
 image=np.frombuffer((OUT/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy();hashes=[]
 for name,compute in [('Average',cv.img_hash.averageHash),('Block mean',cv.img_hash.blockMeanHash),('Color moments',cv.img_hash.colorMomentHash),('Marr-Hildreth',cv.img_hash.marrHildrethHash),('Perceptual',cv.img_hash.pHash),('Radial variance',cv.img_hash.radialVarianceHash)]:
  value=compute(image);hashes.append(dict(name=name,dtype=str(value.dtype),values=value.flatten().tolist()))
 cases.append(dict(file=f['file'],width=f['width'],height=f['height'],hashes=hashes))
(OUT/'image-hash-reference.json').write_text(json.dumps(dict(schema=1,opencv=cv.__version__,source='synthetic pixel fixtures',cases=cases),indent=2)+'\n')
