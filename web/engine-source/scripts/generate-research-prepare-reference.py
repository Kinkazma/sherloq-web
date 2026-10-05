from pathlib import Path
import numpy as np,cv2,json
cv2.setNumThreads(2);out=Path(__file__).resolve().parents[1]/'.build/m3/learned';cases=[]
for i,(w,h) in enumerate([(448,176),(131,97),(1537,1031)]):
 rgb=np.random.default_rng(1701+i).integers(0,256,(h,w,3),np.uint8);file=f'research-prepare-{i}.rgb';rgb.tofile(out/file);resized=cv2.resize(rgb,(1024,1024));files=[]
 for unit in [0,1]:
  pixels=(resized.astype(float)/255).astype(np.float32) if unit else resized.astype(np.float32);name=f'research-prepare-{i}-{unit}.bin';pixels.transpose(2,0,1).copy().tofile(out/name);files.append(name)
 cases.append(dict(w=w,h=h,file=file,outputs=files))
(out/'research-prepare-reference.json').write_text(json.dumps(cases))
