from pathlib import Path
import sys,json,hashlib,argparse
import cv2 as cv
import numpy as np
sys.dont_write_bytecode=True
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core.pca import PcaEngine
out=Path(__file__).resolve().parents[1]/'.build/pca-stream-reference';out.mkdir(parents=True,exist_ok=True)
w,h=1600,1100;y,x=np.mgrid[:h,:w];rgb=np.stack([(x*7+y*3)%256,(x//7+y*11)%256,(x*13+y//3)%256],axis=2).astype(np.uint8)
cv.imwrite(str(out/'source.jpg'),rgb[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,87]);bgr=cv.imread(str(out/'source.jpg'));engine=PcaEngine(bgr);cases=[]
for params in [(1,'project',False,False),(2,'crossprod',True,True)]:
 result,model=engine.compute(params);cases.append(dict(params=dict(zip(['component','mode','invert','equalize'],params)),sha256=hashlib.sha256(result[:,:,::-1].tobytes()).hexdigest(),model=[a.reshape(-1).tolist() for a in model]))
(out/'reference.json').write_text(json.dumps(dict(width=w,height=h,cases=cases),indent=2)+'\n');print('Generated two native PCA output checksums')
