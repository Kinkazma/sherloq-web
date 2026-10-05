"""Rich public multiscale field with two identical distant6000x8000 halves."""
from pathlib import Path
import numpy as np,cv2,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';cv2.setNumThreads(2)
y,x=np.mgrid[:683,:512];small=np.stack([(x*7+y*11)%256,(x*3+y*13)%256,(x*17+y*5)%256],2).astype(np.uint8)
rng=np.random.default_rng(93017)
for _ in range(280):
 x,y=map(int,rng.integers([0,0],[490,660]));cv2.rectangle(small,(x,y),(x+int(rng.integers(5,22)),y+int(rng.integers(5,22))),tuple(map(int,rng.integers(0,256,3))),-1)
half=cv2.resize(small,(6000,8000),interpolation=cv2.INTER_LINEAR)
for y in range(0,8000,32):half[y:y+32]=np.clip(half[y:y+32].astype(np.int16)+rng.integers(-12,13,half[y:y+32].shape,dtype=np.int16),0,255).astype(np.uint8)
image=np.concatenate([half,half],axis=1);file=out/'m3-96mp-sparse.jpg';assert cv2.imwrite(str(file),image,[cv2.IMWRITE_JPEG_QUALITY,90]);report=dict(file=file.name,width=12000,height=8000,description='Public deterministic multiscale RGB field, rectangles and full-resolution noise; second6000x8000 half cloned at dx6000, JPEG90.',sha256=hashlib.sha256(file.read_bytes()).hexdigest(),bytes=file.stat().st_size);(out/'m3-96mp-sparse.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
