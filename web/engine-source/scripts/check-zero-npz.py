from pathlib import Path
import json,hashlib,numpy as np,zipfile
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'.build/zero-export.npz';reference=json.loads((ROOT/'fixtures/zero-reference.json').read_text());f=next(x for x in reference['cases'] if x['name']=='spliced');e=next(x for x in f['expected'] if x['missing']);maximum=0
with zipfile.ZipFile(path) as archive:assert archive.testzip() is None
with np.load(path,allow_pickle=False) as arrays:
 for name,expected in e['arrays'].items():
  a=arrays[name];assert a.dtype==np.dtype(expected['dtype'])
  assert a.shape==((64,) if name=='grid_log10_nfa' else (f['height'],f['width']))
  if name=='grid_log10_nfa':maximum=float(np.max(np.abs(a-np.asarray(expected['values']))));assert maximum<1e-8
  else:assert hashlib.sha256(a.tobytes()).hexdigest()==expected['sha256']
 meta=json.loads(str(arrays['metadata_json']));assert meta['main_grid']==e['metadata']['main_grid']
 provenance=json.loads(str(arrays['browser_provenance_json']));assert provenance['decode']['note']=='Synthetic épreuve 🔬'
 report=dict(schema=1,status='passed',numpy=np.__version__,arrays=9,shape=[f['height'],f['width']],crc='all members verified',allow_pickle=False,unicode='accent and non-BMP roundtrip',maxSignificanceError=maximum,bytes=path.stat().st_size)
(ROOT/'docs/zero-npz-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
