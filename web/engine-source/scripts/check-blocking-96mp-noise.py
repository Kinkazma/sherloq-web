from pathlib import Path
import json,hashlib,zipfile,numpy as np
root=Path(__file__).resolve().parents[1];p=root/'docs/blocking-96mp-proof.json';report=json.loads(p.read_text());reference=json.loads((root/'.build/blocking-96mp/reference.json').read_text())
for i,case in enumerate(report['result']['cases']):
 archive=root/'.build/blocking-96mp'/f'noise-{i}.npz';descriptor=case['noiseExport'];assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==descriptor['sha256']
 with zipfile.ZipFile(archive) as z:assert z.testzip() is None
 with np.load(archive) as z:
  values=z['noise'];assert list(values.shape)==descriptor['shape'];digest=hashlib.sha256(values.tobytes()).hexdigest();assert digest==descriptor['noiseSha256']==reference['cases'][i]['noiseSha256']
 descriptor['independentReader']={'numpy':np.__version__,'allValuesNativeExact':True,'crcChecked':True,'afterSourceRelease':True}
p.write_text(json.dumps(report,indent=2)+'\n');print('Complete blocking noise fields independently verified')
