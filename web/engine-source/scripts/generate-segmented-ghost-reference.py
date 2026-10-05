"""Independent native global Ghost references; writes only own tests/data JSON."""
from pathlib import Path
import json,sys,hashlib,cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ghost_maps import GhostEngine
assert cv.__version__=='4.11.0';cv.setNumThreads(1)
file='tests/data/tiff-stream/tiles-bigtiff.tiff';image=cv.imread(str(root/file));engine=GhostEngine(image,workers=1);cases=[]
for low,high,step,x,y in [(60,100,20,7,3),(80,100,20,7,3)]:
 params=(low,high,step,x,y,True,False);maps=engine.maps(params);raw=np.stack([engine.blocks.get((x,y,q))for q in range(low,high+1,step)],axis=2)
 cases.append(dict(params=dict(low=low,high=high,step=step,x=x,y=y),shape=list(maps.shape),rawSha256=hashlib.sha256(memoryview(raw)).hexdigest(),mapsSha256=hashlib.sha256(memoryview(maps)).hexdigest()))
(root/'tests/data/segmented-ghost-native.json').write_text(json.dumps(dict(opencv=cv.__version__,file=file,width=image.shape[1],height=image.shape[0],cases=cases),indent=2)+'\n')
