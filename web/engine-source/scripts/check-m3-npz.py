"""Read the public worker API exports with NumPy, with pickle disabled."""
import json,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';records=[]
for method in ['sparse','safire','focal','adaifl']:
 with np.load(out/f'api-{method}.npz',allow_pickle=False) as z:
  metadata=json.loads(str(z['metadata_json']));assert metadata['method']==method
  if method=='sparse':assert metadata['biomes'] and z['points'].shape[1]==7 and z['pairs'].shape[1]==4
  elif method=='focal':assert z['features'].shape==(4096,288) and np.array_equal(z['map'].astype(np.uint8).reshape(-1),np.fromfile(out/'learned/focal-labels.bin',np.uint8))
  elif method=='adaifl':assert np.array_equal(z['mask'],(z['map']>.5).astype(np.uint8))
  else:assert z['prompt_clusters'].dtype==np.int64 and z['source_probabilities'].shape[1:]==(1024,1024)
  records.append(dict(method=method,shapes={k:list(z[k].shape) for k in z.files},dtypes={k:str(z[k].dtype) for k in z.files},pickle=False))
(root/'docs/m3-npz-proof.json').write_text(json.dumps(records,indent=2)+'\n')
