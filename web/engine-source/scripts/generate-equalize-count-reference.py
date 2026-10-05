"""Compact oracle for native equalization above float32's exact integer range."""
from pathlib import Path
import hashlib,json
import numpy as np,cv2
root=Path(__file__).resolve().parents[1];cv2.setNumThreads(1)
cases=[]
for first,middle,last in [(0,1,255),(7,129,233)]:
 counts=[(first,1),(middle,8388608),(last,8388609)];gray=np.concatenate([np.full(count,v,np.uint8) for v,count in counts]);out=cv2.equalizeHist(gray)
 digest=hashlib.sha256()
 for start in range(0,len(out),65536):digest.update(np.repeat(out[start:start+65536].reshape(-1,1),3,axis=1).tobytes())
 offset=0;samples=[]
 for value,count in counts:samples.append(dict(input=value,output=int(out[offset,0]),count=count));offset+=count
 cases.append(dict(count=int(gray.size),bins=[[v,n] for v,n in counts],samples=samples,rgbSha256=digest.hexdigest()))
record=dict(schema=1,reference='OpenCV4.11 equalizeHist on explicit16777218 uint8 samples; grayscale replicated to RGB for the magnifier oracle',opencv=cv2.__version__,numpy=np.__version__,cases=cases)
(root/'fixtures/equalize-count-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
