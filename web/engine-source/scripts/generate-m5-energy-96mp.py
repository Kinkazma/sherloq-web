"""Full native 96MP energy reference, with positive smoothed and distant-copy regions."""
from pathlib import Path
import sys,json,hashlib,time,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import ElaBiomeEngine
from gui.sherloq_app.core.ela_energy import segment_energy
cv.setNumThreads(1)
folder=root/'.build/integration/large-energy';folder.mkdir(parents=True,exist_ok=True)
image=cv.imread(str(root/'.build/integration/large-zero/source.png'));assert image.shape==(8000,12000,3)
image[2500:4000,3000:5000]=cv.GaussianBlur(image[2500:4000,3000:5000],(7,7),0)
source=folder/'source.png';assert cv.imwrite(str(source),image,[cv.IMWRITE_PNG_COMPRESSION,0]);engine=ElaBiomeEngine(image,str(source));cases=[]
for shadow in [50,20]:
 start=time.perf_counter();params=dict(quality=75,block=32,minimum=1,profile='manual',histogramLow=10,histogramHigh=990,shadow=shadow,highlight=shadow)
 base=engine.prepare(32,75,energy=True,energy_quantiles=[.01,.99]);print('prepared',shadow,flush=True)
 labels,regions=segment_energy(base,0,1,energy_thresholds=[shadow/10,shadow/10]);assert len(regions)>0
 arrays={}
 for key in ['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']:
  a=labels if key=='energy_labels' else base[key]
  a=np.asarray(a,dtype='<i4' if key in ['energy_scope','energy_labels'] else '<f4');entry=dict(sha256=hashlib.sha256(memoryview(a)).hexdigest(),bytes=a.nbytes)
  if key=='energy_planes':entry['planes']=[hashlib.sha256(memoryview(plane)).hexdigest() for plane in a]
  arrays[key]=entry
 cases.append(dict(params=params,arrays=arrays,regions=regions,summary=base['energy_summary'],automatic=None,nativeMs=(time.perf_counter()-start)*1000));print('case',shadow,'regions',regions,flush=True)
(folder/'reference.json').write_text(json.dumps(dict(width=12000,height=8000,sourceSha256=hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),cases=cases),indent=2)+'\n')
