"""Read the actual worker's NPZ with NumPy, without pickle or expected input tensors."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
root=Path(__file__).resolve().parents[1];backend=sys.argv[1] if len(sys.argv)>1 else 'webgpu'
assert backend in ['webgpu','cpu']
archive=root/'.build/d2prl-private-package'/('worker-raw-'+backend+'.npz');records=[]
with np.load(archive,allow_pickle=False) as result:
 for i,name in enumerate(['union','target','source']):
  actual=result['raw_'+name+'_0'];expected=np.fromfile(root/'.build/d2prl-model'/('native-raw-'+str(i)+'.bin'),dtype='<f4').reshape(448,448)
  error=float(np.max(np.abs(actual-expected)));sign_changes=int(np.count_nonzero((actual>0)!=(expected>0)))
  assert actual.dtype==np.float32 and actual.shape==(448,448) and error<=1e-4 and sign_changes==0
  if i==0:assert np.array_equal(actual,expected)
  records.append(dict(plane=name,maxAbsolute=error,signChanges=sign_changes,sha256=hashlib.sha256(actual.tobytes()).hexdigest()))
 metadata=json.loads(str(result['metadata_json']));assert metadata['raw_filter_applied'] is False and metadata['raw_shape']==[3,448,448]
 provenance=json.loads(str(result['browser_provenance_json']));assert provenance['output']=='raw-model-grids-before-postprocess'
proof=dict(schema=1,status='passed',backend=backend,scope='Independent NumPy allow_pickle=False read of actual common-worker raw-grid export; union exact, residuals <=1e-4 and signs unchanged on the declared source.',records=records,archiveSha256=hashlib.sha256(archive.read_bytes()).hexdigest())
(root/'docs'/('d2prl-worker-raw-'+backend+'-proof.json')).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
