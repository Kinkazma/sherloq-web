from pathlib import Path
import json,hashlib,h5py,numpy as np
root=Path(__file__).resolve().parents[1];path=root/'.build/prnu-hdf5-pages/full.h5';report=json.loads((root/'docs/prnu-hdf5-pages-proof.json').read_text())
assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==report['sha256']
with h5py.File(root/'fixtures/prnu-snapshot.h5') as reference,h5py.File(path) as actual:
 assert list(reference)==list(actual)
 for name in reference:
  assert np.array_equal(reference[name]['fingerprint'][()],actual[name]['fingerprint'][()])
  for key in reference[name].attrs:
   a,b=reference[name].attrs[key],actual[name].attrs[key]
   if key in ['training_manifest','skipped_images']: assert json.loads(a)==json.loads(b)
   else: assert np.array_equal(a,b)
 assert actual.attrs['complete']==1
report['independentReader']={'h5py':h5py.__version__,'fingerprints':'all bit-exact','cameraAttributes':'same values, JSON whitespace ignored','afterDatabaseRelease':True};(root/'docs/prnu-hdf5-pages-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(report['independentReader'])
