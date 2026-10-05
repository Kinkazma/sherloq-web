from pathlib import Path
import sys,json,hashlib,time,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela import ElaEngine
assert cv.__version__=='4.11.0';cv.setNumThreads(1)
source=root.parent/'web-engine/.build/jpeg-12000x8000.jpg';folder=root/'.build/integration/large-source';folder.mkdir(parents=True,exist_ok=True);start=time.perf_counter();image=cv.imread(str(source));assert image.shape==(8000,12000,3)
rgb=cv.cvtColor(image,cv.COLOR_BGR2RGB);originalHash=hashlib.sha256(memoryview(rgb)).hexdigest();del rgb
files=[]
for name,params in [('source.png',[cv.IMWRITE_PNG_COMPRESSION,0]),('source.tiff',[cv.IMWRITE_TIFF_COMPRESSION,1])]:
 path=folder/name;assert cv.imwrite(str(path),image,params);files.append({'file':name,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()});print('encoded',name,flush=True)
engine=ElaEngine(image);expected=[]
for params in [(75,50,20,False,False),(75,37,59,False,True)]:
 t=time.perf_counter();output=engine.compute(params);rgb=cv.cvtColor(output,cv.COLOR_BGR2RGB);expected.append({'params':dict(zip(['quality','scale','contrast','linear','grayscale'],params)),'sha256':hashlib.sha256(memoryview(rgb)).hexdigest(),'nativeMs':(time.perf_counter()-t)*1000});del output,rgb;print('native ELA',expected[-1],flush=True)
report={'width':12000,'height':8000,'complexity':'Full native random RGB-derived JPEG source, seed130014; rich high-frequency texture, no crop/resizing.','rgbSha256':originalHash,'files':files,'ela':expected,'nativePreparationMs':(time.perf_counter()-start)*1000}
(folder/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('complete',flush=True)
