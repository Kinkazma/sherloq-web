from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
import json
out=Path(__file__).resolve().parents[1]/'.build/ela-peers';out.mkdir(parents=True,exist_ok=True)
cases=[]
for n,mode in [(17,'random'),(129,'random'),(257,'random'),(257,'identical'),(513,'duplicates'),(257,'grid')]:
 rng=np.random.default_rng(431);data=rng.random((n,6)) if mode=='random' else np.zeros((n,6)) if mode=='identical' else (rng.integers(0,4,(n,6)) if mode=='duplicates' else np.column_stack([np.arange(n)%7,np.arange(n)//7,*[np.zeros(n)]*4])).astype(float)
 query=data[:min(n,32)];k=min(n,128);distances,indices=cKDTree(data).query(query,k=k)
 cases.append(dict(n=n,mode=mode,k=k,points=data.ravel().tolist(),query=query.ravel().tolist(),distances=distances.ravel().tolist(),indices=indices.ravel().tolist()))
(out/'reference.json').write_text(json.dumps(cases))
