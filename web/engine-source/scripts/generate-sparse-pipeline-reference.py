from pathlib import Path
import sys,json
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning2 import Cloning2Engine,render
ref=json.loads((root/'.build/m3/sparse-reference.json').read_text());image=np.frombuffer((root/'.build/m3/sparse-rgb.bin').read_bytes(),np.uint8).reshape(ref['height'],ref['width'],3)[:,:,::-1].copy();cases=[]
for c in ref['cases']:
 if c.get('reflected'):continue
 family='SIFT + G2NN + RANSAC' if c['family']=='SIFT-G2NN' else c['family']
 for model in ['None','Affine']:
  p=(family,100,300.,5.,.7 if c['family']=='SIFT-G2NN' else .3,50.,model,3.,4,8,8,False,2.,True,False,False,tuple(tuple(map(tuple,poly)) for poly in c['excluded']),(),1,True)
  regions=tuple(tuple(map(tuple,poly)) for poly in c['regions']);r=Cloning2Engine(image).analyze(p,regions)
  name=c['name']+'/'+model;style=(0.,10000.,4,(),True,True,True,True,(),False);rgb,visible,legend=render(image,r,style);file=name.replace('/','-')+'.rgb';(root/'.build/m3'/file).write_bytes(rgb[:,:,::-1].copy().tobytes())
  cases.append(dict(name=name,options=dict(algorithm=family,limit=100,radius=300.,minimum=5.,threshold=p[4],tolerance=50.,model=model,geometricThreshold=3.,geometricMinimum=4,regions=c['regions'],excluded=c['excluded']),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],colors=r['colors'].tolist(),bases=r['bases'],owners=r['pair_search_regions'].tolist(),candidateComparisons=r['candidate_comparisons'],totalFeatures=r['total_features'],render=dict(file=file,visible=visible,legend=legend)))

positive=np.concatenate([image,image],axis=1);positivefile='sparse-positive-rgb.bin';(root/'.build/m3'/positivefile).write_bytes(positive[:,:,::-1].copy().tobytes())
for family in ['ORB','AKAZE','SIFT','RootSIFT','SIFT + G2NN + RANSAC']:
 p=(family,1000,600.,5.,.7 if family=='SIFT + G2NN + RANSAC' else .3,50.,'Affine',3.,4,8,8,False,2.,True,False,False,(),(),1,True);r=Cloning2Engine(positive).analyze(p);assert len(r['groups'])>0
 style=(0.,10000.,4,(),True,True,True,True,(),False);rgb,visible,legend=render(positive,r,style);file=family+'-positive.rgb';(root/'.build/m3'/file).write_bytes(rgb[:,:,::-1].copy().tobytes())
 cases.append(dict(name=family+'/positive/Affine',imageFile=positivefile,width=positive.shape[1],height=positive.shape[0],options=dict(algorithm=family,limit=1000,radius=600.,minimum=5.,threshold=p[4],tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],colors=r['colors'].tolist(),bases=r['bases'],owners=r['pair_search_regions'].tolist(),candidateComparisons=r['candidate_comparisons'],totalFeatures=r['total_features'],render=dict(file=file,visible=visible,legend=legend)))

# True mirror pair with explicit regions: OCR runs on the unchanged image.
mirrored=np.concatenate([image,image[:,::-1]],axis=1);file='sparse-mirrored-rgb.bin';(root/'.build/m3'/file).write_bytes(mirrored[:,:,::-1].copy().tobytes())
family='SIFT + G2NN + RANSAC + Panels + Text';regions=(((0.,0.),(447.,0.),(447.,175.),(0.,175.)),);p=(family,600,600.,5.,.7,50.,'Affine',3.,4,8,8,True,2.,True,False,False,(),(),1,True)
r=Cloning2Engine(mirrored).analyze(p,regions);assert len(r['groups'])>0
style=(0.,10000.,4,(),True,True,True,True,(),True);rgb,visible,legend=render(mirrored,r,style);rgbfile='panels-text-reflected.rgb';(root/'.build/m3'/rgbfile).write_bytes(rgb[:,:,::-1].copy().tobytes())
cases.append(dict(name='Panels-Text/reflected/Affine',imageFile=file,width=mirrored.shape[1],height=mirrored.shape[0],options=dict(algorithm=family,limit=600,radius=600.,minimum=5.,threshold=.7,tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4,regions=regions,reflections=True),points=r['points'].tolist(),pairs=r['pairs'].tolist(),groups=[g.tolist() for g in r['groups']],models=r['models'],colors=r['colors'].tolist(),bases=r['bases'],owners=r['pair_search_regions'].tolist(),candidateComparisons=r['candidate_comparisons'],totalFeatures=r['total_features'],textBoxes=r['preprocessing']['text_boxes'],partitions=r['biome_partitions'],render=dict(file=rgbfile,visible=visible,legend=legend)))
(root/'.build/m3/sparse-pipeline-reference.json').write_text(json.dumps(dict(width=ref['width'],height=ref['height'],cases=cases),separators=(',',':'))+'\n')
