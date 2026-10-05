from pathlib import Path
import sys,json,numpy as np,torch,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));torch.set_num_threads(2);cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning2 import Cloning2Engine,render,memberships,biomes,palette
from gui.sherloq_app.core import learned_copy
from gui.sherloq_app.core.copy_geometry import verify
from gui.sherloq_app.core.copy_overlap import reject_self
out=root/'.build/m3';image=np.fromfile(out/'sparse-positive-rgb.bin',np.uint8).reshape(176,448,3)[:,:,::-1].copy();cases=[]
comparison=(((0,0),(223,0),(223,175),(0,175)),((224,0),(447,0),(447,175),(224,175)))
for algorithm,kind in [('XFeat + LighterGlue','xfeat'),('ALIKED + LightGlue','aliked'),('ALIKED rotation + LightGlue','aliked'),('SIFT + LightGlue','sift')]:
 for name in (['compare','global','overlap'] if kind=='xfeat' else ['compare']):
  regions=comparison if name=='compare' else () if name=='global' else (((0,0),(330,0),(330,175),(0,175)),((110,0),(447,0),(447,175),(110,175)))
  excluded=(((0,0),(40,0),(40,60),(0,60)),);compare=name=='compare';p=(algorithm,300,600.,5.,.7,50.,'Affine',3.,4,8,8,False,2.,True,False,False,excluded,(),1,True)
  r=Cloning2Engine(image).analyze(p,regions,compare)
  if name=='overlap':
   points,desc,member,total=learned_copy.extract(image,300,regions,True,excluded=excluded);parts=[];groups=[];offset=0;evaluated=0
   for z in range(len(regions)):
    part,count=learned_copy.match(points,desc,member[:,z:z+1],600.,5.,.7,False,True,image.shape,kind=kind);parts.append(part);evaluated+=count;groups.extend(g+offset for g in biomes(points,part,50.));offset+=len(part)
   r['pairs']=np.concatenate(parts);r['pair_search_regions']=np.concatenate([np.full(len(part),z,np.int32) for z,part in enumerate(parts)]);groups,models=verify(points,r['pairs'],groups,'Affine',3.,4);groups,models,rejected=reject_self(points,r['pairs'],groups,models,5.);r.update(groups=groups,models=models,rejected_biomes=rejected,candidate_comparisons=evaluated);r['colors'],r['bases']=palette(groups,r['pairs'],.7)
  rgb,visible,legend=render(image,r,(0.,10000.,4,(),True,True,True,True,(),False));file=f'glue-{len(cases)}.rgb';(out/file).write_bytes(rgb[:,:,::-1].copy().tobytes())
  cases.append(dict(name=algorithm+'/'+name,kind=kind,options=dict(algorithm=algorithm,limit=300,radius=600.,minimum=5.,threshold=.7,tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4,regions=regions,excluded=excluded,compare=compare),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],owners=r['pair_search_regions'].tolist(),totalFeatures=r['total_features'],candidateComparisons=r['candidate_comparisons'],render=dict(file=file,visible=visible,legend=legend)))
  print(algorithm,name,len(r['pairs']),len(r['groups']),flush=True)
  if kind=='sift':
   points,desc,member,total=learned_copy.extract_lightglue(image,300,regions,True,'sift',excluded=excluded);points.tofile(out/'sift-glue-extract-points.bin');desc.tofile(out/'sift-glue-extract-descriptors.bin');member.tofile(out/'sift-glue-extract-members.bin')
(out/'glue-pipeline-reference.json').write_text(json.dumps(dict(width=448,height=176,imageFile='sparse-positive-rgb.bin',cases=cases),separators=(',',':'))+'\n')
