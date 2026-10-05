"""Publicable 8 MP recipe and checksums without storing a large image blob."""
from pathlib import Path
import sys,json,hashlib
import numpy as np,cv2
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core import prnu
OUT=ROOT/'web-engine/fixtures'
w,h=4096,2048
i=np.arange(w*h,dtype=np.uint32)
state=i*np.uint32(1103515245)+np.uint32(12345)
rgb=np.stack([state>>24,(state>>16)&255,(state>>8)&255],axis=1).astype(np.uint8).reshape(h,w,3)
residual=prnu.extract_residual(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY).astype(np.float64)/255)
scores=prnu.PrnuEngine(rgb[:,:,::-1]).identify(str(OUT/'prnu-snapshot.h5'))
record=dict(schema=1,recipe='uint32-lcg-index-rgb',width=w,height=h,
            inputSha256=hashlib.sha256(rgb.tobytes()).hexdigest(),
            residualShape=list(residual.shape),residualSha256=hashlib.sha256(residual.astype('<f8').tobytes()).hexdigest(),scores=scores)
(OUT/'prnu-large-reference.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
