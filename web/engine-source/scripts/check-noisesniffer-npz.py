"""Read the portable NPZ with native NumPy, retaining BGR and int64 indices."""
from pathlib import Path
import json,hashlib,zipfile
import numpy as np
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'.build/noisesniffer-export.npz'
ref=json.loads((ROOT/'fixtures/noisesniffer-reference.json').read_text());case=next(c for c in ref['cases'] if c['name']=='small-patch-3');expected=case['analyses'][4]
with zipfile.ZipFile(path) as z:assert z.testzip() is None
with np.load(path,allow_pickle=False) as out:
 for key in ['mask','distribution','all_blocks','low_noise_blocks','selected','low_noise']:
  r=expected['arrays'][key];a=np.frombuffer((ROOT/'fixtures'/r['file']).read_bytes(),r['dtype']).reshape(r['shape'])
  if key=='distribution':a=np.ascontiguousarray(a[:,:,::-1])
  assert out[key].dtype==a.dtype and out[key].shape==a.shape and out[key].tobytes()==a.tobytes(),key
 meta=json.loads(str(out['metadata_json']));assert meta['parameters']==expected['parameters']
 assert len(meta['regions'])==len(expected['regions'])
 for actual,target in zip(meta['regions'],expected['regions']):
  assert abs(actual.pop('log10_nfa')-target.pop('log10_nfa'))<=1e-10
  assert actual==target
 assert json.loads(str(out['browser_provenance_json']))['decode']['note']=='Synthetic épreuve 🔬'
report=dict(schema=1,status='passed',numpy=np.__version__,arrays=6,pickle=False,distributionOrder='BGR',indices='int64',bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
(ROOT/'docs/noisesniffer-npz-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
