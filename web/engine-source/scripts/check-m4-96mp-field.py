from pathlib import Path
import sys,json,hashlib,zipfile,numpy as np
root=Path(__file__).resolve().parents[1];family=sys.argv[1];key={'frequency':'mask','stereo':'flow'}[family]
p=root/'docs'/f'{family}-96mp-proof.json';report=json.loads(p.read_text());proof=report['result'];descriptor=proof[key+'Export'];archive=root/'.build'/f'{family}-96mp'/f'{key}.npz'
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==descriptor['sha256']
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
with np.load(archive) as arrays:
 values=arrays[key];digest=hashlib.sha256(values.tobytes()).hexdigest();assert digest==descriptor['maskSha256'];assert values.shape==(8000,12000 if family=='frequency' else 11808)
 reader={'numpy':np.__version__,'shape':list(values.shape),'dtype':str(values.dtype),'sha256':digest,'crcChecked':True,'afterSourceRelease':True}
 if family=='frequency':assert digest==json.loads((root/'.build/frequency-96mp/reference.json').read_text())['cases'][0]['maskSha256'];reader['allValuesNativeExact']=True
 else:
  expected=np.memmap(root/'.build/stereo-96mp/flow.f32',dtype='<f4',mode='r',shape=values.shape);difference=np.abs(values.astype(np.float64)-expected);reader.update(maximumAbsoluteError=float(difference.max()),meanAbsoluteError=float(difference.mean()),nonidentical=int(np.count_nonzero(values!=expected)),nativeMinimum=float(expected.min()),nativeMaximum=float(expected.max()),units='horizontal displacement in original pixels');assert reader['maximumAbsoluteError']<=2e-5
 descriptor['independentReader']=reader
p.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(reader))
