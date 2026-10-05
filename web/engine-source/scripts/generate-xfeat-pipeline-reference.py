from pathlib import Path
import sys,json,numpy as np,torch,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2);cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning2 import Cloning2Engine,render
image=np.frombuffer((root/'.build/m3/sparse-positive-rgb.bin').read_bytes(),np.uint8).reshape(176,448,3)[:,:,::-1].copy();cases=[]
for name,regions,excluded,compare in [('global',(),(),False),('overlap',(((0,0),(330,0),(330,175),(0,175)),((110,0),(447,0),(447,175),(110,175))),(((0,0),(70,0),(70,80),(0,80)),),False),('compare',(((0,0),(223,0),(223,175),(0,175)),((224,0),(447,0),(447,175),(224,175))),(),True)]:
 p=('XFeat',1000,600.,5.,.3,50.,'Affine',3.,4,8,8,False,2.,True,False,False,excluded,(),1,True);r=Cloning2Engine(image).analyze(p,regions,compare)
 # The approved v2 contract preserves independent overlapping searches.
 if name=='overlap':
  from gui.sherloq_app.core.cloning2 import memberships,biomes,palette
  from gui.sherloq_app.core.copy_geometry import verify
  from gui.sherloq_app.core.copy_overlap import reject_self
  raw=r['pairs'];member=memberships(r['points'],image.shape[:2],regions);ids=raw[:,:2].astype(int);parts=[raw[member[ids[:,0],z]&member[ids[:,1],z]] for z in range(len(regions))];groups=[];offset=0
  for part in parts:
   groups.extend(g+offset for g in biomes(r['points'],part,50.));offset+=len(part)
  r['pairs']=np.concatenate(parts);r['pair_search_regions']=np.concatenate([np.full(len(part),z,np.int32) for z,part in enumerate(parts)])
  groups,models=verify(r['points'],r['pairs'],groups,'Affine',3.,4);groups,models,rejected=reject_self(r['points'],r['pairs'],groups,models,5.)
  r.update(groups=groups,models=models,rejected_biomes=rejected);r['colors'],r['bases']=palette(groups,r['pairs'],.3)
 rgb,visible,legend=render(image,r,(0.,10000.,4,(),True,True,True,True,(),False));file='xfeat-'+name+'.rgb';(root/'.build/m3'/file).write_bytes(rgb[:,:,::-1].copy().tobytes())
 cases.append(dict(name=name,options=dict(algorithm='XFeat',limit=1000,radius=600.,minimum=5.,threshold=.3,tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4,regions=regions,excluded=excluded,compare=compare),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],colors=r['colors'].tolist(),owners=r['pair_search_regions'].tolist(),totalFeatures=r['total_features'],candidateComparisons=r['candidate_comparisons'],render=dict(file=file,visible=visible,legend=legend)))
(root/'.build/m3/xfeat-pipeline-reference.json').write_text(json.dumps(dict(width=448,height=176,imageFile='sparse-positive-rgb.bin',cases=cases),separators=(',',':'))+'\n');print([(c['name'],len(c['pairs']),len(c['groups'])) for c in cases])
