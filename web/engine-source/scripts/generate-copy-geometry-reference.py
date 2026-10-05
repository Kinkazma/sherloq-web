from pathlib import Path
import sys,json,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.copy_geometry import verify
from gui.sherloq_app.core.copy_subbiomes import refine
from gui.sherloq_app.core.copy_overlap import reject_self
from gui.sherloq_app.core.cloning2 import palette,biome_sides
cases=[]
def add(name,a,b,model='Affine',threshold=1.,minimum=4,reflection=False,groups=None,tolerance=12.,minimum_distance=5.):
 p=np.zeros((len(a)*2,7),np.float32);p[:len(a),:2]=a;p[len(a):,:2]=b
 pairs=np.column_stack([np.arange(len(a)),np.arange(len(a))+len(a),np.linspace(.1,.7,len(a)),np.linalg.norm(np.asarray(a)-np.asarray(b),axis=1)]).astype(np.float64)
 pairs[::3,:2]=pairs[::3,1::-1]
 groups=[np.arange(len(a))] if groups is None else [np.asarray(g) for g in groups]
 verified,models=verify(p,pairs,groups,model,threshold,minimum,reflection=reflection)
 colors,bases=palette(verified,pairs,.7)
 refined,fitted,shades,newbases,provenance=refine(p,pairs,verified,models,colors,bases,tolerance)
 accepted,kept,rejected=reject_self(p,pairs,verified,models,minimum_distance)
 sides=[tuple(x.tolist() for x in biome_sides(p,pairs,g)) for g in groups]
 cases.append(dict(name=name,points=p.tolist(),pairs=pairs.tolist(),groups=[g.tolist() for g in groups],model=model,threshold=threshold,minimum=minimum,reflection=reflection,tolerance=tolerance,minimumDistance=minimum_distance,sides=sides,expected=dict(groups=[g.tolist() for g in verified],models=models,colors=colors.tolist(),bases=bases,refined=[g.tolist() for g in refined],refinedModels=fitted,shades=shades.tolist(),refinedBases=newbases,provenance=provenance,accepted=[g.tolist() for g in accepted],rejected=rejected)))
a=np.array([[x,y] for x in [0,10,20,70,80,90] for y in [0,10,20]],np.float32)
add('translation',a,a+[180,50])
add('similarity',a,a*2+[180,50],model='Similarity')
add('reflection',a,a*[-1,1]+[250,50],model='Similarity',reflection=True)
add('two-models',a,np.vstack([a[:9]+[180,50],a[9:]+[160,100]]))
add('outliers',a,np.vstack([a[:-3]+[180,50],[[400,900],[600,700],[800,100]]]))
add('homography',a,a+[180,50],model='Homography')
add('insufficient-centres',np.zeros((8,2)),np.ones((8,2))*100)
add('self-overlap',a,a+[1,1])
add('near-identity',a,a+[5,0],minimum_distance=6)
add('none',a,a+[180,50],model='None')
add('independent-groups',a,a+[180,50],groups=[list(range(9)),list(range(9,18))])
reference=root.parent/'source/gui/sherloq_app/core'
(root/'tests/m3-data/copy-geometry-reference.json').write_text(json.dumps(dict(cases=cases,nativeSha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [reference/'copy_geometry.py',reference/'copy_subbiomes.py',reference/'copy_overlap.py',reference/'cloning2.py']}),separators=(',',':'))+'\n')
