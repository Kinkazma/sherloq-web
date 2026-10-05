"""Independent complete export read after full-source detail processing."""
from pathlib import Path
import json,hashlib,zipfile
import numpy as np
root=Path(__file__).resolve().parents[1];folder=root/'.build/dense-detail-96mp';path=root/'docs/dense-detail-96mp-proof.json'
proof=json.loads(path.read_text());oracle=json.loads((folder/'oracle.json').read_text());archive=folder/'full.npz'
assert archive.stat().st_size==proof['export']['byteLength']
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==proof['export']['sha256']
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
with np.load(archive) as data:
 actual=data['detail_samples'];expected=np.fromfile(folder/'samples.f32',np.float32).reshape(32,81)
 assert actual.dtype==np.float32 and np.array_equal(actual,expected)
 metadata=json.loads(str(data['metadata_json']));scores=[dict(name=c['name'],**c['expected']) for c in oracle['cases']]
 assert metadata['scores']==scores==proof['scores']
assert proof['cachedSampleReads']==0 and proof['shape']==[8000,12000,3]
proof['independentReader']={'numpy':np.__version__,'sha256Checked':True,'allEntriesCrcChecked':True,'allSamplesAndScoresNativeExact':True,'afterSourceRelease':True}
path.write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof['independentReader']))
