"""Synthetic grayscale pyramid oracle. Run generate-cloning-study.py --large first."""
from pathlib import Path
import hashlib,json
import numpy as np
import cv2 as cv
assert np.__version__=='1.26.4' and cv.__version__=='4.11.0'
root=Path(__file__).resolve().parents[1];base=root/'.build/cloning-study';out=root/'.build/brisk-area-study';out.mkdir(exist_ok=True)
source=json.loads((base/'reference.json').read_text());records=[]
def layer(name,image):
 file=name+'.gray';image.tofile(out/file)
 return dict(file=file,width=image.shape[1],height=image.shape[0],sha256=hashlib.sha256(image.tobytes()).hexdigest())
for entry in source['images']:
 a=np.fromfile(base/entry['gray'],np.uint8).reshape(entry['height'],entry['width']);images=[a];layers=[layer(entry['name']+'-0',a)]
 for i in range(1,6):
  inp=images[0 if i==1 else i-2]
  size=(2*(inp.shape[1]//3),2*(inp.shape[0]//3)) if i==1 else (inp.shape[1]//2,inp.shape[0]//2)
  result=cv.resize(inp,size,interpolation=cv.INTER_AREA);images.append(result);layers.append(layer(entry['name']+'-'+str(i),result))
 records.append(dict(name=entry['name'],layers=layers))
rng=np.random.default_rng(260001)
for i in range(600):
 w=int(rng.integers(7,22 if i<300 else 258));h=int(rng.integers(7,258))
 a=rng.integers(0,256,(h,w),np.uint8)
 if i%3==1:a=(a>127).astype(np.uint8)*255
 if i%3==2:a[:]=a[0]
 size=(w//2,h//2) if i%2==0 else (2*(w//3),2*(h//3))
 b=cv.resize(a,size,interpolation=cv.INTER_AREA);name='extra-'+str(i)
 records.append(dict(name=name,layers=[layer(name+'-0',a),layer(name+'-1',b)]))
(out/'reference.json').write_text(json.dumps(dict(numpy=np.__version__,opencv=cv.__version__,seed=260001,images=records),indent=2)+'\n')
print(sum(len(x['layers'])-1 for x in records),'native interpolation cases')
