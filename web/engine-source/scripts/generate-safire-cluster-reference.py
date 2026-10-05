from pathlib import Path
import numpy as np,torch,json,sys
torch.set_num_threads(2)
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.safire import cluster
out=root/'.build/m3/learned';rng=np.random.default_rng(701);cases=[]
base=np.fromfile(out/'safire-proposal-means.bin',np.float32).reshape(4,256)
for n in [4,16,64,256,1024]:
 features=base[np.arange(n)%4]+rng.normal(0,.001,(n,256)).astype(np.float32)
 filename=f'safire-cluster-{n}.bin';features.tofile(out/filename)
 for k in [1,2,3,16]:
  labels=cluster(features,groups=k);cases.append(dict(file=filename,count=n,kind='kmeans',groups=k,labels=labels.tolist()))
 for eps,minimum in [(.0001,1),(.03,2),(.2,3)]:
  labels=cluster(features,kind='dbscan',eps=eps,minimum=minimum);cases.append(dict(file=filename,count=n,kind='dbscan',eps=eps,minimum=minimum,labels=labels.tolist()))
initial={str(n):np.random.RandomState(1701).choice(n,min(n,16),replace=False).tolist() for n in range(1,1025)}
(out/'safire-cluster-reference.json').write_text(json.dumps(dict(initial=initial,cases=cases),separators=(',',':')))
