from pathlib import Path
import json,hashlib,h5py,numpy as np
root=Path(__file__).resolve().parents[1];out=root/'.build/prnu-build-96mp';path=root/'docs/prnu-build-96mp-proof.json';report=json.loads(path.read_text());proof=report['result'];reference=json.loads((out/'reference.json').read_text())
assert hashlib.file_digest((out/'built.h5').open('rb'),'sha256').hexdigest()==proof['export']['sha256']
native=np.load(out/'native-mean.npy',mmap_mode='r');maximum=0.;total=0.;count=0;different=0
with h5py.File(out/'built.h5','r') as f:
 assert f.attrs['complete']==1;group=f['development-camera'];assert group.attrs['n_used']==2;assert json.loads(group.attrs['training_manifest'])==reference['trainingManifest'];values=group['fingerprint'];assert values.shape==native.shape;assert values.chunks==(128,128) and values.compression=='gzip' and values.compression_opts==4
 for y in range(0,len(native),128):
  a=values[y:y+128];b=native[y:y+128];assert np.isfinite(a).all();error=np.abs(a-b);maximum=max(maximum,float(error.max()));total+=float(error.sum());count+=error.size;different+=int(np.count_nonzero(error))
assert maximum<=1e-12,maximum
proof['independentReader']={'h5py':h5py.__version__,'afterDatabaseAndSourceRelease':True,'shape':list(native.shape),'maximumAbsoluteError':maximum,'meanAbsoluteError':total/count,'differentValues':different,'trainingManifestExact':True,'chunking':[128,128],'gzipLevel':4};path.write_text(json.dumps(report,indent=2)+'\n');print(proof['independentReader'])
