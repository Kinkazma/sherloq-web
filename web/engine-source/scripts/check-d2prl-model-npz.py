"""Read actual browser model exports with independent NumPy, no pickle."""
from pathlib import Path
import argparse,hashlib,json,zipfile
import numpy as np
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--tag',default='gpu-whole');args=parser.parse_args();report=json.loads((root/f'docs/d2prl-model-api-{args.tag}-chrome-proof.json').read_text());assert report['status']=='passed'
zones=args.tag.endswith('-zones');base=root/('.build/d2prl-model-zones' if zones else '.build/d2prl-model');reference=json.loads((base/('reference.json' if zones else 'source-return-reference.json')).read_text());p=root/f'.build/d2prl-private-package/export-{args.tag}.npz';assert hashlib.sha256(p.read_bytes()).hexdigest()==report['exported']['sha256'];arrays={}
with zipfile.ZipFile(p) as z:assert z.testzip() is None
with np.load(p,allow_pickle=False) as archive:
 metadata=json.loads(str(archive['metadata_json']));provenance=json.loads(str(archive['browser_provenance_json']));assert metadata==report['metadata'];assert provenance['modelId']==report['modelId'];minimum=metadata['min_component'];shape=(reference['height'],reference['width'])
 if zones:
  row=next(r for r in reference['records'] if r['minimum']==minimum and r['envelope']==report['exported']['envelope']);expected={k:np.fromfile(base/s['file'],np.dtype(s['dtype'])).reshape(shape) for k,s in row['outputs'].items()}
 else:
  masks=np.fromfile(base/next(r['file'] for r in reference['masks'] if r['minimum']==minimum),np.float32).reshape((3,*shape));expected=dict(map=np.fromfile(base/reference['map']['file'],np.float32).reshape(shape),mask=masks[0].astype(np.uint8),target=masks[1],source=masks[2],analyzed=np.ones(shape,np.uint8))
 expected['candidates']=np.zeros(shape,np.uint8)
 assert set(archive.files)==set(expected)|{'metadata_json','browser_provenance_json'}
 for key,value in expected.items():
  actual=archive[key];assert actual.dtype==value.dtype and actual.shape==value.shape and actual.tobytes()==value.tobytes(),key;arrays[key]=dict(shape=list(actual.shape),dtype=str(actual.dtype),sha256=hashlib.sha256(actual.tobytes()).hexdigest())
result=dict(schema=1,status='passed',scope='Actual browser D2PRL export read by NumPy allow_pickle=False; all six source-coordinate arrays and metadata equal native reference.',numpy=np.__version__,arrays=arrays,exportSha256=report['exported']['sha256'],modelId=report['modelId'])
(root/f'docs/d2prl-model-npz-{args.tag}-proof.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(status='passed',arrays=len(arrays),tag=args.tag)))
