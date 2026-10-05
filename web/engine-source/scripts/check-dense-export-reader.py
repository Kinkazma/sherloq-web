from pathlib import Path
import hashlib,json,zipfile,numpy as np
root=Path(__file__).resolve().parents[1]
report=json.loads((root/'docs/dense-paged-export-proof.json').read_text())
path=root/'.build/dense-export/full.npz'
assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==report['sha256']
with zipfile.ZipFile(path) as z: assert z.testzip() is None
with np.load(path) as z:
 for source,key in [('targets','targets'),('distancesSquared','distances_squared'),('allowed','allowed'),('selected','selected'),('errors','errors')]:
  assert hashlib.sha256(z['field_0_'+key].tobytes()).hexdigest()==report['expected'][source]
 for key,dtype in [('points',np.float32),('pairs',np.float64),('colors',np.uint8),('pair_search_regions',np.int32)]:
  expected=np.fromfile(root/'.build/dense-pipeline-reference'/('0-'+key),dtype=dtype)
  assert np.array_equal(z[key].ravel(),expected)
 metadata=json.loads(str(z['metadata_json']));assert metadata['maps'][0]['width']==74 and len(metadata['models'])==1
report['independentReader']={'numpy':np.__version__,'crc':'all entries valid','fields':'all five hashes exact','nativeArrays':'points, pairs, colors, provenance exact','afterSourceRelease':True}
(root/'docs/dense-paged-export-proof.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['independentReader']))
