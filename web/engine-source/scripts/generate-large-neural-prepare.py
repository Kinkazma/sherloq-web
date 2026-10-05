"""Public JPEG -> native Torch/Pillow preparation, without weights or inference."""
from pathlib import Path
import hashlib,json,time
import cv2,numpy as np,PIL,torch,torchvision
from PIL import Image
from torchvision import transforms as T
root=Path(__file__).resolve().parents[1];torch.set_num_threads(1);cv2.setNumThreads(1)
assert PIL.__version__=='12.2.0' and torch.__version__.split('+')[0]=='2.8.0'
file='.build/jpeg-12000x8000.jpg';rgb=cv2.cvtColor(cv2.imread(str(root/file),cv2.IMREAD_COLOR),cv2.COLOR_BGR2RGB);height,width=rgb.shape[:2]
def sha(a):return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
cases=[];started=time.perf_counter()
for bounds in [[0,0,width,height],[137,83,11903,7919]]:
 x0,y0,x1,y1=bounds;crop=rgb[y0:y1,x0:x1];normalized=T.ToTensor()(crop)[None];tensor=T.Resize((448,448))(normalized);d2=dict(shape=list(tensor.shape),sha256=sha(tensor.numpy()));del normalized,tensor
 segmentation=[]
 for side in [256,512]:
  resized=T.Resize((side,side))(Image.fromarray(crop));tensor=T.ToTensor()(resized)[None];segmentation.append(dict(side=side,rgbSha256=sha(resized),tensorSha256=sha(tensor.numpy())))
 cases.append(dict(bounds=bounds,width=x1-x0,height=y1-y0,d2prl=d2,segmentation=segmentation));print(json.dumps(dict(bounds=bounds,prepared=True)),flush=True)
native='source/gui/sherloq_app/core/clone_models.py';record=dict(schema=1,scope='Complete native preparation from the existing public synthetic96MP JPEG and an actual rectangular crop; no inference or final mask qualification.',file=file,width=width,height=height,originalSha256=hashlib.sha256((root/file).read_bytes()).hexdigest(),nativeSources={native:hashlib.sha256((root.parent/native).read_bytes()).hexdigest()},torch=torch.__version__,torchvision=torchvision.__version__,opencv=cv2.__version__,pillow=PIL.__version__,cases=cases)
(root/'.build/neural-rows-large-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),seconds=time.perf_counter()-started)))
