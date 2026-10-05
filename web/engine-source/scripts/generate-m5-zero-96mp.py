from pathlib import Path
import sys,json,hashlib,time,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.zero import analyze,jpeg99
from gui.sherloq_app.tools.jpeg.zero import display
folder=root/'.build/integration/large-zero';folder.mkdir(parents=True,exist_ok=True);cv.setNumThreads(1)
image=cv.imread(str(root.parent/'web-engine/.build/jpeg-12000x8000.jpg'));assert image.shape==(8000,12000,3)
# Preserve the first JPEG grid and insert a far-away patch at a different grid
# origin. PNG is lossless: no final JPEG recompression erases the foreign grid.
image[6203:7403,8501:10001]=image[32:1232,16:1516].copy();assert cv.imwrite(str(folder/'source.png'),image,[cv.IMWRITE_PNG_COMPRESSION,0]);print('source ready',flush=True)
start=time.perf_counter();companion,_=jpeg99(image);result=analyze(image,companion);print('native analysis done',time.perf_counter()-start,flush=True)
arrays={k:{'sha256':hashlib.sha256(memoryview(a)).hexdigest(),'dtype':str(a.dtype),'values':a.tolist() if k=='grid_log10_nfa' else None,'nonzero':int(np.count_nonzero(a))} for k,a in result.items() if isinstance(a,np.ndarray)}
views=[]
for mode in [0,1,3]:
 rgb=cv.cvtColor(display((result,mode)),cv.COLOR_BGR2RGB);views.append({'mode':mode,'sha256':hashlib.sha256(memoryview(rgb)).hexdigest()});del rgb
reference={'width':12000,'height':8000,'copiedFrom':[16,32,1500,1200],'copiedTo':[8501,6203,1500,1200],'arrays':arrays,'views':views,'metadata':result['metadata'],'nativeMs':(time.perf_counter()-start)*1000}
(folder/'reference.json').write_text(json.dumps(reference,indent=2)+'\n');print('reference complete',reference['metadata'],flush=True)
