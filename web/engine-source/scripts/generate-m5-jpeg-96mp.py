"""Native full-source curve and shifted Ghost reference; own ignored outputs."""
from pathlib import Path
import sys,json,hashlib,time,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.jpeg_curve import RecompressionCurve
from gui.sherloq_app.core.ghost_maps import GhostEngine
cv.setNumThreads(1)
folder=root/'.build/integration/large-zero';source=folder/'source.png';image=cv.imread(str(source));assert image.shape==(8000,12000,3)
start=time.perf_counter();curve=RecompressionCurve(image,qualities=range(101),workers=2).compute(progress=lambda n,*_:print('curve',n,flush=True));curveMs=(time.perf_counter()-start)*1000
engine=GhostEngine(image,workers=1);cases=[]
for low,high,step,x,y in [(60,100,20,7,3),(80,100,20,7,3)]:
 start=time.perf_counter();params=(low,high,step,x,y,True,False);maps=engine.maps(params);raw=np.stack([engine.blocks.get((x,y,q))for q in range(low,high+1,step)],axis=2)
 cases.append(dict(params=dict(low=low,high=high,step=step,x=x,y=y),shape=list(maps.shape),rawSha256=hashlib.sha256(memoryview(raw)).hexdigest(),mapsSha256=hashlib.sha256(memoryview(maps)).hexdigest(),nativeMs=(time.perf_counter()-start)*1000));print('ghost',cases[-1],flush=True)
(folder/'jpeg-reference.json').write_text(json.dumps(dict(opencv=cv.__version__,width=12000,height=8000,sourceSha256=hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),curve=curve.tolist(),curveMs=curveMs,ghost=cases),indent=2)+'\n')
