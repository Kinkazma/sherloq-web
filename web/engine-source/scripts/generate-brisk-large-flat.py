from pathlib import Path
import numpy as np,cv2,json
out=Path(__file__).resolve().parents[1]/'.build/m3';cv2.setNumThreads(2);image=np.full((2304,3072,3),127,np.uint8);points,_=cv2.BRISK_create().detectAndCompute(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),None);assert not points;cv2.imwrite(str(out/'brisk-large-flat.png'),image);(out/'brisk-large-flat-native.json').write_text(json.dumps(dict(width=3072,height=2304,keypoints=len(points))))
