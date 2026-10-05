from pathlib import Path
import sys,json,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning2 import spatial_matches
rng=np.random.default_rng(421);cases=[]
for binary in [False,True]:
 for mode in ['global','zones','compare','gap','compact']:
  n=40;points=np.zeros((n,7),np.float32);points[:,:2]=rng.integers(0,60,(n,2))
  desc=rng.integers(0,256,(n,61 if binary else 128),dtype=np.uint8) if binary else rng.random((n,128),dtype=np.float32)*.08
  members=np.ones((n,1),bool) if mode=='global' else rng.integers(0,2,(n,2)).astype(bool)
  options=dict(radius=45.,minimum=4.,threshold=.52 if binary else .4,compare=mode in ['compare','gap'],radii=None if mode=='global' else (22.,45.),gap=(20.,0.) if mode=='gap' else (0.,0.),axes=(np.maximum(0,np.arange(100)-20).astype(np.float32),np.arange(100,dtype=np.float32)) if mode=='compact' else None)
  pairs,evaluated=spatial_matches(points,desc,members,binary=binary,**options)
  # v2 preserves each independent context rather than assigning only first.
  rows=[];owners=[]
  for row in pairs:
   i,j=map(int,row[:2]);zones=[-1] if options['compare'] else [z for z in range(members.shape[1]) if members[i,z] and members[j,z] and (options['radii'] is None or row[3]<=options['radii'][z])]
   for z in zones:rows.append(row.tolist());owners.append(z)
  order=sorted(range(len(rows)),key=lambda i:(owners[i],i));options['axes']=None if options['axes'] is None else [a.tolist() for a in options['axes']]
  cases.append(dict(name=('binary-' if binary else 'float-')+mode,points=points.tolist(),descriptors=desc.tolist(),members=members.tolist(),options=options,binary=binary,expected=[rows[i] for i in order],owners=[owners[i] for i in order],evaluated=evaluated))
desc=rng.integers(0,256,(12,128)).astype(np.float32);desc[0]=0
normalized=desc/np.maximum(np.linalg.norm(desc,axis=1,keepdims=True),1e-12);roots=np.sqrt(desc/np.maximum(desc.sum(axis=1,keepdims=True),1e-12))
(root/'tests/m3-data/copy-spatial-reference.json').write_text(json.dumps(dict(cases=cases,normalization=dict(descriptors=desc.tolist(),sift=normalized.tolist(),root=roots.tolist())),separators=(',',':'))+'\n')
