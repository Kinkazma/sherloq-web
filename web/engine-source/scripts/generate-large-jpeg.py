"""Public deterministic large JPEG recipe; generated image stays in .build.
Run with the pinned native reference Python/OpenCV, not a private photograph.
"""
import argparse,hashlib,json,sys
from pathlib import Path
import cv2,numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--width',type=int,default=12000);parser.add_argument('--height',type=int,default=8000);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build';out.mkdir(exist_ok=True)
width,height=args.width,args.height;rng=np.random.default_rng(130014)
bgr=np.empty((height,width,3),np.uint8)
for y in range(0,height,64):bgr[y:y+64]=rng.integers(0,256,size=bgr[y:y+64].shape,dtype=np.uint8)
ok,encoded=cv2.imencode('.jpg',bgr,[cv2.IMWRITE_JPEG_QUALITY,90]);assert ok
stem=f'jpeg-{width}x{height}';(out/(stem+'.jpg')).write_bytes(encoded.tobytes());del bgr
reference=cv2.imdecode(encoded,cv2.IMREAD_COLOR);assert reference.shape==(height,width,3)
digest=hashlib.sha256();bins=np.zeros((3,256),np.int64)
for y in range(0,height,64):
 rgb=np.ascontiguousarray(reference[y:y+64,:,::-1]);digest.update(rgb.tobytes())
 for c in range(3):bins[c]+=np.bincount(rgb[:,:,c].ravel(),minlength=256)
sys.path.insert(0,str(root.parent/'source'/'gui'))
from sherloq_app.core.histogram import analyze_histogram
histogram,unique,ratio=analyze_histogram(reference)
regions=[]
for x,y,w,h in [(0,0,17,19),(width-31,height-23,31,23),(width//2-7,height//2-9,67,71),(13,57,257,63)]:
 regions.append(dict(x=x,y=y,width=w,height=h,sha256=hashlib.sha256(np.ascontiguousarray(reference[y:y+h,x:x+w,::-1]).tobytes()).hexdigest()))
record=dict(schema=1,recipe=dict(seed=130014,generator='numpy.default_rng integers uint8 BGR; sequential64-row groups',numpy=np.__version__,opencv=cv2.__version__,quality=90,progressive=False),file=stem+'.jpg',width=width,height=height,encodedBytes=len(encoded),originalSha256=hashlib.sha256(encoded).hexdigest(),rgbSha256=digest.hexdigest(),rgbBins=bins.tolist(),histogram=histogram.tolist(),uniqueColors=unique,uniqueRatio=float(ratio),histogramSourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/histogram.py').read_bytes()).hexdigest(),regions=regions)
(out/(stem+'-reference.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ['file','width','height','encodedBytes','originalSha256','rgbSha256']}))
