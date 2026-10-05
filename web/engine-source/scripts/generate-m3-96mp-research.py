"""Own public96MP source and exact fixed-grid preparation; no private images."""
from pathlib import Path
import cv2,numpy as np,json,hashlib,time
from PIL import Image
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';out.mkdir(parents=True,exist_ok=True);cv2.setNumThreads(2)
source=root.parent/'web-engine/.build/jpeg-12000x8000.jpg';bgr=cv2.imread(str(source));assert bgr.shape==(8000,12000,3)
bgr[6144:7168,10240:11264]=bgr[512:1536,512:1536];bgr[4096:4608,7680:8704]=bgr[2048:2560,2048:3072][:,::-1]
file=out/'m3-96mp-rich.jpg';assert cv2.imwrite(str(file),bgr,[cv2.IMWRITE_JPEG_QUALITY,90]);del bgr
rgb=cv2.cvtColor(cv2.imread(str(file)),cv2.COLOR_BGR2RGB);records=[]
for method in ['focal','safire','adaifl']:
 resized=np.asarray(Image.fromarray(rgb).resize((1024,1024),Image.Resampling.BILINEAR)) if method=='adaifl' else cv2.resize(rgb,(1024,1024),interpolation=cv2.INTER_LINEAR)
 tensor=np.ascontiguousarray((resized.astype(np.float64)/(1 if method=='safire' else 255)).astype(np.float32).transpose(2,0,1));name='m3-96mp-'+method+'-prepared.bin';tensor.tofile(out/name);records.append(dict(method=method,file=name,sha256=hashlib.sha256(tensor.tobytes()).hexdigest()))
windows=[]
for x,y,w,h in [(0,0,17,19),(512,512,31,29),(10240,6144,31,29),(11963,7971,37,29)]:windows.append(dict(x=x,y=y,width=w,height=h,sha256=hashlib.sha256(np.ascontiguousarray(rgb[y:y+h,x:x+w]).tobytes()).hexdigest()))
report=dict(width=12000,height=8000,file=file.name,source='Existing public seed130014 noisy JPEG, then two distant patches (one mirrored) before JPEG90 encoding.',originalSha256=hashlib.sha256(file.read_bytes()).hexdigest(),bytes=file.stat().st_size,windows=windows,preparations=records)
(out/'m3-96mp-rich.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
