from pathlib import Path
import sys,json,numpy as np,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning2 import Cloning2Engine,render
out=root/'.build/m3/learned';ref=json.loads((out/'aliked-extract-reference.json').read_text());image=np.fromfile(out/ref['imageFile'],np.uint8).reshape(ref['height'],ref['width'],3)[:,:,::-1].copy();regions=tuple(tuple(map(tuple,p)) for p in ref['regions']);excluded=tuple(tuple(map(tuple,p)) for p in ref['excluded']);cases=[]
for c in ref['cases']:
 data={k:np.fromfile(out/v['file'],np.dtype(v['dtype'])).reshape(v['shape']) for k,v in c['files'].items()};family='ALIKED' if c['kind']=='aliked-n16' else 'ALIKED rotation';p=(family,1000,1200.,5.,.3,50.,'Affine',3.,4,8,8,False,2.,True,False,False,excluded,(),1,True)
 engine=Cloning2Engine(image);engine.features.put((c['kind'],1000,regions,True,excluded,False),(data['points'],data['descriptors'],data['members'],c['totalFeatures']));r=engine.analyze(p,regions);rgb,visible,legend=render(image,r,(0.,10000.,4,(),True,True,True,True,(),False));file=c['kind']+'-pipeline.rgb';rgb[:,:,::-1].copy().tofile(out/file)
 cases.append(dict(name=family,kind=c['kind'],options=dict(algorithm=family,limit=1000,radius=1200.,minimum=5.,threshold=.3,tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4,regions=regions,excluded=excluded),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],owners=r['pair_search_regions'].tolist(),render=dict(file=file,visible=visible,legend=legend)))
 print(family,len(r['pairs']),len(r['groups']),flush=True)
(out/'aliked-pipeline-reference.json').write_text(json.dumps(dict(width=ref['width'],height=ref['height'],imageFile=ref['imageFile'],cases=cases),separators=(',',':'))+'\n')
