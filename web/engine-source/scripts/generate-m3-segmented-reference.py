from pathlib import Path
import cv2,numpy as np,json
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';cv2.setNumThreads(2)
# Codec's contiguous staging cap selects segmented scanlines at60MP even though
# the simpler native zero-feature BRISK task can fit the shared3GiB budget.
image=np.full((6000,10000,3),127,np.uint8);cv2.imwrite(str(out/'m3-segmented-flat.jpg'),image,[cv2.IMWRITE_JPEG_QUALITY,90]);points,_=cv2.BRISK_create().detectAndCompute(image[:,:,0].copy(),None);assert len(points)==0
(out/'m3-segmented-native.json').write_text(json.dumps(dict(width=10000,height=6000,keypoints=0,value=127)))
