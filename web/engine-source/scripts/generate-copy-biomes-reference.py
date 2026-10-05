from pathlib import Path
import sys,json,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning2 import biomes
rng=np.random.default_rng(3200);cases=[]
def add(name,p,pairs,tolerance,zones=None):
 if zones is None:groups=biomes(p,pairs,tolerance)
 else:
  groups=[]
  for zone in np.unique(zones):
   rows=np.flatnonzero(zones==zone);groups.extend(rows[g] for g in biomes(p,pairs[rows],tolerance))
 cases.append(dict(name=name,points=p.tolist(),pairs=pairs.tolist(),tolerance=tolerance,zones=None if zones is None else zones.tolist(),expected=[g.tolist() for g in groups]))
p=np.zeros((50,7),np.float32);p[:,:2]=rng.uniform(0,100,(50,2));p[25:,:2]=p[:25,:2]+[150,50]
pairs=np.column_stack([np.arange(25),np.arange(25)+25,np.zeros((25,2))]).astype(np.float64)
add('translation',p,pairs,25.)
rev=pairs.copy();rev[::2,:2]=rev[::2,1::-1];add('reversed',p,rev,25.)
add('independent-contexts',p,pairs,100.,np.arange(25,dtype=np.int32)%2)
add('disjoint-small-groups',p,pairs,5.)
add('large-connected-no-area-cap',p,pairs,10000.)
add('empty',p,pairs[:0],10.)
p[:,:2]=np.arange(50)[:,None]%2
add('duplicate-zero-tolerance',p,pairs,0.)
p=np.zeros((6,7),np.float32);p[:,:2]=[[0,0],[3,4],[3,4.00001],[100,100],[103,104],[103,104.00001]]
pairs=np.array([[0,3,0,0],[1,4,0,0],[2,5,0,0]],np.float64)
add('boundary',p,pairs,5.)
(root/'tests/m3-data/copy-biomes-reference.json').write_text(json.dumps(dict(cases=cases,nativeSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/cloning2.py').read_bytes()).hexdigest()),separators=(',',':'))+'\n')
