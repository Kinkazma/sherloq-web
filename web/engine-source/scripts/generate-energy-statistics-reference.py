"""Owned bounded-statistics oracle; does not modify shared fixtures/native code."""
from pathlib import Path
import json
import numpy as np
root=Path(__file__).resolve().parents[1]
count=1000019
i=np.arange(count,dtype=np.uint64)
words=(i*2654435761+(i>>3)*3266489917)&0xffffffff
values=((words&65535).astype(np.float64)/257).astype(np.float32)
cases=[]
for quantiles in [[.01,.99],[.123,.876]]:
    a,b=np.quantile(values,quantiles)
    low,high=np.float32(a),np.float32(b)
    groups=[values[(values>=low)&(values<=high)],values[values<=low],values[values>=high]]
    r={'q10':float(a),'q90':float(b)}
    for name,group in zip(['central','low','high'],groups):
        r[name+'_mean']=float(group.mean()) if len(group) else float((a+b)/2)
        r[name+'_variance']=float(group.var()) if len(group) else 0.0
    cases.append({'quantiles':quantiles,'expected':r})
(root/'tests/data/energy-statistics-native.json').write_text(json.dumps({'count':count,'numpy':np.__version__,'formula':'float32(((uint32(i*2654435761+(i>>3)*3266489917)) &65535)/257)','cases':cases},indent=2)+'\n')
