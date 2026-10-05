from pathlib import Path
import json,numpy as np
from scipy.spatial import cKDTree
root=Path(__file__).resolve().parents[1];rng=np.random.default_rng(792);cases=[]
for n in [0,1,16,17,40,801,4096]:
 for mode in ['random','ties','identical']:
  points=rng.random((n,2))*100 if mode=='random' else rng.integers(0,10,(n,2)).astype(np.float64) if mode=='ties' else np.zeros((n,2))
  cases.append(dict(name=str(n)+'-'+mode,points=points.tolist(),order=cKDTree(points).indices.tolist()))
ref=json.loads((root/'.build/m3/sparse-pipeline-reference.json').read_text())
for c in ref['cases'][-2:]:
 points=np.asarray(c['points'])[:,:2];cases.append(dict(name=c['name'],points=points.tolist(),order=cKDTree(points).indices.tolist()))
(root/'tests/m3-data/copy-tree-reference.json').write_text(json.dumps(dict(cases=cases),separators=(',',':'))+'\n')
