from pathlib import Path
import sys,json,hashlib,shutil
sys.dont_write_bytecode=True
import cv2 as cv
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.prnu import extract_residual
out=root/'.build/prnu-build-stream-reference';out.mkdir(parents=True,exist_ok=True)
base=cv.imread(str(root/'.build/wavelet-stream-reference/source.jpg'));files=[];means={};counts={}
for name,image in [('large_camera_1.jpg',base),('large_camera_2.jpg',np.roll(base[:900,:1200],3,axis=1)),('small_camera_1.jpg',base[:83,:79]),('small_camera_2.jpg',base[:79,:81])]:
 cv.imwrite(str(out/name),image,[cv.IMWRITE_JPEG_QUALITY,93]);decoded=cv.imread(str(out/name));gray=cv.cvtColor(decoded,cv.COLOR_BGR2GRAY).astype(np.float64)/255;residual=extract_residual(gray);label='_'.join(Path(name).stem.split('_')[:-1]);count=counts.get(label,0)+1
 if label in means:
  h=min(means[label].shape[0],residual.shape[0]);w=min(means[label].shape[1],residual.shape[1]);old=means[label][:h,:w];means[label]=old+(residual[:h,:w]-old)/count
 else:means[label]=residual
 counts[label]=count;files.append(dict(name=name,sha256=hashlib.sha256((out/name).read_bytes()).hexdigest()))
(out/'reference.json').write_text(json.dumps(dict(files=files,cameras=[dict(name=k,width=v.shape[1],height=v.shape[0],sha256=hashlib.sha256(v.tobytes()).hexdigest()) for k,v in sorted(means.items())]),indent=2)+'\n')
