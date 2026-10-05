"""Reopen browser-produced HDF5 using the unchanged native PRNU oracle."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import h5py,cv2
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core import prnu
engine=ROOT/'web-engine'
ref=json.loads((engine/'fixtures/prnu-reference.json').read_text())
query=engine/'fixtures'/ref['query']['file']
results=[]
for name in ['prnu-browser-export.h5','prnu-browser-built.h5']:
    path=engine/'.build'/name
    with h5py.File(path,'r') as file:
        assert file.attrs['schema']==prnu.SCHEMA and bool(file.attrs['complete'])
        assert prnu.validate_database(file)==[f['camera'] for f in ref['fingerprints']]
        for camera in ref['fingerprints']:
            group=file[camera['camera']]
            actual=group['fingerprint'][:]
            expected=np.frombuffer((engine/'fixtures'/camera['file']).read_bytes(),'<f8').reshape(camera['shape'])
            assert actual.dtype==np.float64 and actual.tobytes()==expected.tobytes()
            assert json.loads(group.attrs['training_manifest'])==camera['manifest']
            assert group.attrs['n_images']==camera['nImages'] and group.attrs['n_used']==camera['nUsed']
    scores=prnu.PrnuEngine(cv2.imread(str(query)),str(query)).identify(str(path))
    assert [list(x) for x in scores]==ref['databases'][0]['scores']
    results.append(dict(file=name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),scores=scores,float64BitsExact=True,metadataExact=True))
report=dict(schema=1,status='passed',nativeH5py=h5py.__version__,exports=results)
(engine/'docs/prnu-native-readback.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
