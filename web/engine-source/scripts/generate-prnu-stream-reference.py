from pathlib import Path
import sys,json,hashlib,shutil
sys.dont_write_bytecode=True
import cv2 as cv
import numpy as np
import h5py
from scipy.signal import correlate,choose_conv_method
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.prnu import extract_residual,ncc
out=root/'.build/prnu-stream-reference';out.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/'.build/wavelet-stream-reference/source.jpg',out/'source.jpg')
bgr=cv.imread(str(out/'source.jpg'));rgb=bgr[:,:,::-1].copy();(out/'source.rgb').write_bytes(rgb.tobytes());h,w=rgb.shape[:2];gray=cv.cvtColor(rgb,cv.COLOR_RGB2GRAY).astype(np.float64)/255;residual=extract_residual(gray)
mean=correlate(gray,np.ones((3,3)),'same')/9;noise=float(np.mean(correlate(gray**2,np.ones((3,3)),'same')/9-mean**2))
with h5py.File(root/'fixtures/prnu-snapshot.h5','r') as db:scores=sorted([(k,ncc(residual,db[k]['fingerprint'][:])) for k in db],key=lambda x:-x[1])
(out/'reference.json').write_text(json.dumps(dict(width=w,height=h,method=choose_conv_method(gray,np.ones((3,3)),'same'),noisePower=noise,residualSha256=hashlib.sha256(residual.tobytes()).hexdigest(),scores=scores),indent=2)+'\n')
