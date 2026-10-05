from pathlib import Path
import sys,json,hashlib,shutil
import cv2 as cv
import numpy as np
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1];sys.path[:0]=[str(root.parent/'source/gui'),str(root.parent/'source')]
from sherloq_app.core.interactive import FrequencyEngine
from sherloq_app.core.frequency_mask import circular_mask
out=root/'.build/frequency-stream-reference';out.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/'.build/wavelet-stream-reference/source.jpg',out/'source.jpg');bgr=cv.imread(str(out/'source.jpg'));h,w=bgr.shape[:2];engine=FrequencyEngine(bgr);cases=[]
for params in [(15,5,0,0),(15,5,37,3),(15,5,37,7),(15,5,37,7)]:
 frames=engine.compute(params);mask=circular_mask(engine.dft.shape[:2],*params[:2]);mask=mask.copy()
 if params[2]:mask[engine.magnitude0<int(params[2]/100*255)]=0
 cases.append(dict(params=dict(zip(['split','smooth','threshold','filter'],params)),sha256=[hashlib.sha256(f[:,:,::-1].tobytes()).hexdigest() for f in frames[:4]],zeroPercent=frames[4],maskSha256=hashlib.sha256(mask.tobytes()).hexdigest()))
(out/'reference.json').write_text(json.dumps(dict(width=w,height=h,cases=cases),indent=2)+'\n')
