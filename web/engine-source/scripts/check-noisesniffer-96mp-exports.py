from pathlib import Path
import hashlib,json,zipfile,numpy as np
root=Path(__file__).resolve().parents[1];out=root/'.build/noisesniffer-96mp';p=root/'docs/noisesniffer-96mp-proof.json';report=json.loads(p.read_text());r=report['result'];ref=json.loads((out/'reference.json').read_text());assert r['source']['sha256']==ref['sourceSha256'];path=out/'analysis.npz';assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==r['scientificExport']['sha256']
with zipfile.ZipFile(path) as z:assert z.testzip() is None
with np.load(path) as z:
 for name in ['mask','all_blocks','low_noise_blocks','selected','low_noise']:
  a=z[name];b=np.load(out/(name+'.npy'),mmap_mode='r');assert np.array_equal(a,b),name
 distribution=z['distribution'];h=hashlib.sha256()
 for row in distribution:h.update(np.ascontiguousarray(row[:,::-1]).tobytes())
 assert h.hexdigest()==ref['arrays']['distribution']
for case in r['cases']:
 key='overlay' if case['params']['view']=='regions' else 'distribution';assert case['sha256']==ref['arrays'][key],key;case['allPixelsNativeExact']=True
 metadata=case['data']['metadata'];assert metadata['valid_blocks']==ref['validCount'];assert metadata['selected_blocks']==ref['selectedCount'];assert metadata['low_noise_blocks']==ref['lowNoiseCount']
r['independentReader']={'numpy':np.__version__,'allFieldsNativeExact':True,'crcChecked':True,'afterSourceRelease':True,'nativeSeconds':ref['nativeSeconds']};p.write_text(json.dumps(report,indent=2)+'\n');print(r['independentReader'])
