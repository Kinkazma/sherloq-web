"""Native 96MP automatic energy profiles on the existing rich copied/smoothed source."""
from pathlib import Path
import sys,json,hashlib,time,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import ElaBiomeEngine
from gui.sherloq_app.core.ela_energy import segment_energy
cv.setNumThreads(1);folder=root/'.build/integration/large-energy-auto';folder.mkdir(parents=True,exist_ok=True)
source=root/'.build/integration/large-energy/source.png';image=cv.imread(str(source));assert image.shape==(8000,12000,3);engine=ElaBiomeEngine(image,str(source));cases=[]
for profile in ['sensitive','conservative']:
 start=time.perf_counter();params=dict(quality=75,block=32,minimum=1,profile=profile)
 base=engine.prepare(32,75,energy=True,energy_auto=True,energy_auto_profile=profile);automatic=base['metadata']['energy']['automatic'];print('prepared',profile,automatic,flush=True)
 labels,regions=segment_energy(base,0,1,energy_thresholds=automatic['thresholds']);assert len(regions)>0
 arrays={}
 for key in ['energy_planes','energy_low_score','energy_high_score','energy_scope','energy_labels']:
  a=np.asarray(labels if key=='energy_labels' else base[key],dtype='<i4' if key in ['energy_scope','energy_labels'] else '<f4');entry=dict(sha256=hashlib.sha256(memoryview(a)).hexdigest(),bytes=a.nbytes)
  if key=='energy_planes':entry['planes']=[hashlib.sha256(memoryview(plane)).hexdigest() for plane in a]
  arrays[key]=entry
 cases.append(dict(params=params,arrays=arrays,regions=regions,summary=base['energy_summary'],automatic=automatic,nativeMs=(time.perf_counter()-start)*1000));print('case',profile,'regions',regions,flush=True)
(folder/'reference.json').write_text(json.dumps(dict(width=12000,height=8000,sourceSha256=hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),cases=cases),indent=2)+'\n')
