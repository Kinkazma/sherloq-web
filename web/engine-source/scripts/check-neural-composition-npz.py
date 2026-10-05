"""Read browser NPZ with NumPy; verify native arrays, metadata and ownership export."""
from pathlib import Path
import numpy as np,json,hashlib,zipfile
root=Path(__file__).resolve().parents[1];base=root/'.build/neural-composition';ref=json.loads((base/'reference.json').read_text());records=[]
for e in ref['records']:
 file=base/f"browser-{e['name']}.npz"
 with zipfile.ZipFile(file) as z:assert z.testzip() is None
 with np.load(file,allow_pickle=False) as data:
  for key,spec in e['outputs'].items():
   a=data[key];assert list(a.shape)==spec['shape'] and str(a.dtype)==spec['dtype'];assert hashlib.sha256(a.tobytes()).hexdigest()==spec['sha256'],(e['name'],key)
  metadata=json.loads(str(data['metadata_json']));provenance=json.loads(str(data['browser_provenance_json']));assert metadata['status']==e['status'];assert [z['status'] for z in metadata['zones']]==e['zoneStatuses'];assert provenance['operation']==('ai.clones.d2prl' if e['family']=='d2prl' else 'ai.clones.segmentation');assert 'inférence' in provenance['note']
 records.append(dict(name=e['name'],arrays=list(e['outputs']),bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
record=dict(schema=1,status='passed',scope='Browser streamed NPZ reopened with NumPy allow_pickle=False; ZIP CRC, names, shapes, dtypes, complete native array hashes and Unicode metadata.',numpy=np.__version__,records=records)
(root/'docs/neural-composition-npz-proof.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(status='passed',cases=len(records))))
