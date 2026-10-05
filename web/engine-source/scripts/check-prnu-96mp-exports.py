from pathlib import Path
import hashlib,json,zipfile,numpy as np,h5py
root=Path(__file__).resolve().parents[1];p=root/'docs/prnu-96mp-proof.json';proof=json.loads(p.read_text());r=proof['result'];out=root/'.build/prnu-96mp'
for name,key in [('residual.npz','residualExport'),('database.h5','databaseExport')]:assert hashlib.file_digest((out/name).open('rb'),'sha256').hexdigest()==r[key]['sha256']
with zipfile.ZipFile(out/'residual.npz') as z:assert z.testzip() is None
with np.load(out/'residual.npz') as z:values=z['residual'];native=np.load(out/'native-residual.npy',mmap_mode='r');assert values.shape==native.shape;error=np.abs(values-native);maximum=float(error.max());mean=float(error.mean());assert maximum<=1e-12,(maximum,mean);assert hashlib.sha256(values.tobytes()).hexdigest()==r['residualSha256']
with h5py.File(out/'database.h5','r') as actual,h5py.File(out/'database.h5.original','r') as expected:
 for name in ['same','shifted']:
  a=actual[name]['fingerprint'];b=expected[name]['fingerprint'];assert a.shape==b.shape
  for y in range(0,a.shape[0],128):assert np.array_equal(a[y:y+128],b[y:y+128]),(name,y)
r['independentReader']={'numpy':np.__version__,'h5py':h5py.__version__,'allFingerprintsExact':True,'crcChecked':True,'afterSourceRelease':True,'residualMaximumAbsoluteError':maximum,'residualMeanAbsoluteError':mean};p.write_text(json.dumps(proof,indent=2)+'\n');print(r['independentReader'])
