from pathlib import Path
import numpy as np,json
root=Path(__file__).resolve().parents[1];rng=np.random.default_rng(3500)
p=np.zeros((300,7),np.float32);p[:,:2]=rng.uniform(0,1024,(300,2));p[:,4]=rng.integers(0,4,300)
p[::3,:2]=p[1::3,:2];p[:6,:2]=[[1.0000001,2],[1.0000002,2],[1.0000004,2],[1.0000005,2],[1.0000006,2],[1.0000007,2]]
_,ids=np.unique(np.round(p[:,:2],6),axis=0,return_index=True);ids=np.sort(ids);ids=ids[np.argsort(-p[ids,4],kind='stable')[:100]]
(root/'tests/m3-data/sift-selection-reference.json').write_text(json.dumps(dict(points=p.tolist(),indices=ids.tolist()),separators=(',',':'))+'\n')

double=p.astype(np.float64);double[:6,:2]=[[1.0000001,2],[1.0000002,2],[1.0000004,2],[1.0000005,2],[1.0000006,2],[1.0000007,2]]
_,ids=np.unique(np.round(double[:,:2],6),axis=0,return_index=True);ids=np.sort(ids);ids=ids[np.argsort(-double[ids,4],kind='stable')[:100]]
(root/'tests/m3-data/sift-selection-double-reference.json').write_text(json.dumps(dict(points=double.tolist(),indices=ids.tolist()),separators=(',',':'))+'\n')
