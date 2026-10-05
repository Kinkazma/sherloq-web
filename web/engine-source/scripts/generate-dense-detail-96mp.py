"""Native full-image oracle for the supplemental detail adapter, not matching."""
from pathlib import Path
import sys,json,time,hashlib,argparse
import cv2 as cv
import numpy as np
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--native-gui',type=Path,default=root.parent/'source/gui');args=parser.parse_args()
sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core.copy_detail import detail_image,corroborate
out=root/'.build/dense-detail-96mp';out.mkdir(parents=True,exist_ok=True)
source=root/'.build/dense-96mp/copy-6000.jpg';cv.setNumThreads(4);started=time.monotonic()
image=cv.imread(str(source));assert image.shape==(8000,12000,3)
detail=detail_image(image);rng=np.random.default_rng(640032)
x=rng.uniform(-1,12001,2592).astype(np.float32);y=rng.uniform(-1,8001,2592).astype(np.float32)
x[:12]=[-.5,0,.015625,.046875,63.984375,64.015625,127.984375,128.015625,11999.96875,11999.984375,12000.25,6000.5]
y[:12]=[0,0,7999.984375,7999,64.015625,127.984375,128.015625,7999.96875,-.5,.5,4000.25,7998]
expected=cv.remap(detail,x.reshape(32,81),y.reshape(32,81),cv.INTER_LINEAR,borderMode=cv.BORDER_CONSTANT);expected.tofile(out/'samples.f32')
points=np.zeros((80,7),np.float32);points[:,:2]=[(128+i*450,128+j*700) for j in range(8) for i in range(10)]
cases=[]
for name,matrix in [('translation',[[1,0,6000],[0,1,0],[0,0,1]]),('reflection',[[-1,0,11999],[0,1,0],[0,0,1]]),('scale',[[1.25,0,6000],[0,1.25,0],[0,0,1]])]:
 model=dict(matrix=matrix,source_point_indices=list(range(80)));cases.append(dict(name=name,model=model,expected=corroborate(detail,points,model)))
assert cases[0]['expected']['accepted']
manifest=dict(sourceSha256=hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),width=12000,height=8000,x=x.tolist(),y=y.tolist(),points=points.ravel().tolist(),cases=cases,nativeSeconds=time.monotonic()-started)
(out/'oracle.json').write_text(json.dumps(manifest)+'\n');print(json.dumps({'cases':cases,'nativeSeconds':manifest['nativeSeconds']}))
