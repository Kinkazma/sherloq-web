from pathlib import Path
import sys,json,hashlib,cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.ghost_maps import GhostEngine
OUT=ROOT/'web-engine/fixtures';file='bench-1024.jpg';image=cv.imread(str(OUT/file));engine=GhostEngine(image,workers=1);expected=[]
for x,y in [(0,0),(1,1),(7,3)]:
 p=(50,90,5,x,y,True,False);maps=engine.maps(p);import numpy as np
 raw=np.stack([engine.blocks.get((x,y,q)) for q in engine.validate(p)],axis=2);expected.append(dict(params=dict(low=50,high=90,step=5,x=x,y=y),maps=hashlib.sha256(maps.tobytes()).hexdigest(),raw=hashlib.sha256(raw.tobytes()).hexdigest()));print(x,y,flush=True)
(OUT/'ghost-large-reference.json').write_text(json.dumps(dict(schema=1,file=file,width=image.shape[1],height=image.shape[0],expected=expected),indent=2)+'\n')
