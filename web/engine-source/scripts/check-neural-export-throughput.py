"""Independently read the scheduling candidate's full96MP scientific NPZ."""
from pathlib import Path
import hashlib,json,zipfile,sys
import numpy as np
root=Path(__file__).resolve().parents[1];file=root/'.build/neural-export-throughput/final.npz';stem='neural-export-throughput'+('-cooperative-extracted' if '--extracted' in sys.argv else '');browser=json.loads((root/'docs'/(stem+'-proof.json')).read_text());record=next(v for v in browser['records'] if v['strategy']=='cooperative')
with file.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
assert sha==record['sha256'] and file.stat().st_size==record['byteLength']
with zipfile.ZipFile(file) as archive:assert archive.testzip() is None
reference=json.loads((root/'.build/neural-segmented/d2prl-large/reference.json').read_text());outputs=reference['records'][0]['outputs'];records=[]
with np.load(file,allow_pickle=False) as arrays:
 assert set(arrays.files)==set(outputs)|{'metadata_json','browser_provenance_json'}
 metadata=json.loads(str(arrays['metadata_json']));provenance=json.loads(str(arrays['browser_provenance_json']));assert metadata['pixelSha256']==reference['pixelSha256'] and provenance['originalSha256']==reference['original']['sha256']
 for key,spec in outputs.items():
  a=arrays[key];assert str(a.dtype)==spec['dtype'] and list(a.shape)==spec['shape'];h=hashlib.sha256();flat=a.reshape(-1)
  for at in range(0,flat.size,262144):h.update(flat[at:at+262144].tobytes())
  assert h.hexdigest()==spec['sha256'];records.append(dict(array=key,dtype=str(a.dtype),shape=list(a.shape),sha256=h.hexdigest(),bitExact=True))
proof=dict(schema=1,status='passed',scope='Complete independent NumPy read, no pickle, ZIP CRC and SHA, six exact96MP original scientific planes after export scheduling changes.',bytes=record['byteLength'],sha256=sha,records=records,numpy=np.__version__)
(root/'docs'/(stem+'-npz-proof.json')).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(dict(status='passed',bytes=record['byteLength'],arrays=len(records))))
