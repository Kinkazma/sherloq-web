"""Independent native descriptors across bounded windows and full-width HAL seams."""
from pathlib import Path
import sys,json,cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import describe
assert cv.__version__=='4.11.0' and np.__version__=='1.26.4';cv.setNumThreads(1)
cases=[]
for width,height,block in [(12003,177,80),(6001,209,96)]:
 i=np.arange(width*height*3,dtype=np.uint32);rgb=((i*59+(i>>8)*83+(i>>15)*31)&255).astype(np.uint8).reshape(height,width,3);bgr=cv.cvtColor(rgb,cv.COLOR_RGB2BGR)
 decoded=cv.imdecode(cv.imencode('.jpg',bgr,[cv.IMWRITE_JPEG_QUALITY,75])[1],cv.IMREAD_COLOR)
 arrays=describe(bgr,decoded,block,lambda:False,background=True)
 cases.append(dict(width=width,height=height,block=block,quality=75,**{k:v.tolist() for k,v in zip(['content','profiles','usable','background'],arrays)}))
(root/'tests/data/ela-cell-wide-native.json').write_text(json.dumps(dict(opencv=cv.__version__,numpy=np.__version__,cases=cases),indent=2)+'\n')
