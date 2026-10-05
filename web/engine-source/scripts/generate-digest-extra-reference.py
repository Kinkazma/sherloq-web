from pathlib import Path
import json
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];cases=[]
for name,width,height in [('downsample',531,517),('large',1024,1024)]:
 y,x=np.indices((height,width));rgb=np.stack(((x*13+y*7)%256,(x*x+y*11)%256,((x//19+y//23)*43)%256),axis=2).astype(np.uint8);image=np.ascontiguousarray(rgb[:,:,::-1]);filename=f'digest-{name}.png';cv.imwrite(str(root/'tests/data'/filename),image)
 cases.append(dict(file=filename,width=width,height=height,hashes={'Color moments':cv.img_hash.colorMomentHash(image).ravel().tolist(),'Marr-Hildreth':cv.img_hash.marrHildrethHash(image).ravel().tolist()}))
(root/'tests/data/digest-extra-native.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),separators=(',',':'))+'\n')
