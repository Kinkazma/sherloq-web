"""Independent NumPy/ZIP readback of actual common-worker neural exports."""
from pathlib import Path
import sys,json,hashlib,zipfile
import numpy as np
tag=next((v[6:] for v in sys.argv if v.startswith('--tag=')),'');assert not tag or all(c.islower() or c.isdigit() or c=='-' for c in tag)
root=Path(__file__).resolve().parents[1];variant=sys.argv[1];large='--large' in sys.argv;rich='--rich' in sys.argv;backend='webgpu' if '--gpu' in sys.argv else 'cpu';extracted='--extracted' in sys.argv
base=root/'.build/neural-segmented'/(variant+('-large'+('-rich' if rich else '') if large else ''));ref=json.loads((base/'reference.json').read_text());stem='neural-segmented-'+variant+('-large'+('-rich' if rich else '') if large else '')+'-'+backend+('-'+tag if tag else '')+('-extracted' if extracted else '')
browser=json.loads((root/'docs'/(stem+'-proof.json')).read_text());file=base/('browser-'+backend+('-'+tag if tag else '')+'.npz')
with file.open('rb') as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
assert sha==browser['exported']['sha256'] and file.stat().st_size==browser['exported']['byteLength']
with zipfile.ZipFile(file) as archive:assert archive.testzip() is None
expected=ref['records'][-1]['outputs'];records=[]
with np.load(file,allow_pickle=False) as arrays:
    assert set(arrays.files)==set(expected)|{'metadata_json','browser_provenance_json'}
    metadata=json.loads(str(arrays['metadata_json']));provenance=json.loads(str(arrays['browser_provenance_json']))
    assert provenance['originalSha256']==ref['original']['sha256'] and provenance['layout']=='segmented'
    if browser.get('configuredGpu') and browser['requestedBackend']=='auto' and backend=='cpu':
        assert variant=='mgcfdn-st' and provenance['backend']=='cpu-wasm'
        assert browser['records'][0]['metrics']['execution']['independentZones']['observed']==3
        assert provenance['backendSelection']=='cached-analysis-backend'
        assert metadata['execution']['backend']=='cpu'
    if variant=='mgcfdn-effnet' and backend=='webgpu':
        assert provenance['backend']=='webgpu-cpu'
        assert provenance['kernelParity']==provenance['model']['numericalParity']
        assert 'threshold-crossing mask pixel' in provenance['kernelParity']
    tolerance=provenance.get('model',{}).get('probabilityTolerance',1e-4) if backend=='webgpu' else 1e-4
    assert tolerance in (1e-4,1e-3)
    if metadata.get('execution',{}).get('onnxStages')==2:
        assert metadata['execution']['stageBackends']==provenance['model']['stageBackends']
        assert metadata['execution']['intermediateBytes']==4096008
    assert metadata['pixelSha256']==ref['pixelSha256']
    assert metadata['inferences']==(1 if large and not rich else 0)
    if 'correlationBackend' in metadata.get('execution',{}):
        assert metadata['execution']['correlationBackend']==browser['records'][-1]['metrics']['execution']['correlationBackend']
        assert metadata['execution']['correlationBackend'] in ('wasm-cpu','webgpu-dot-128-wasm-rest','webgpu-resident-dot-128-wasm-rest')
    if 'graphDistanceBackend' in metadata.get('execution',{}):
        assert metadata['execution']['graphDistanceBackend']==browser['records'][-1]['metrics']['execution']['graphDistanceBackend']
        assert metadata['execution']['graphDistanceBackend'] in ('wasm-cpu','webgpu-dot-wasm-postprocess')
    if 'attentionBackend' in metadata.get('execution',{}):
        assert metadata['execution']['attentionBackend']==browser['records'][-1]['metrics']['execution']['attentionBackend']
        assert metadata['execution']['attentionBackend'] in ('wasm-cpu','webgpu-outer-wasm-inner')
    if 'sessionCache' in metadata.get('execution',{}):
        assert metadata['execution']['sessionCache']==browser['records'][-1]['metrics']['execution']['sessionCache']
        assert all(metadata['execution']['sessionCache'][key]==0 for key in ('creations','reuses','pressureEvictions'))
    if 'parameterCache' in metadata.get('execution',{}):
        assert metadata['execution']['parameterCache']==browser['records'][-1]['metrics']['execution']['parameterCache']
        assert all(metadata['execution']['parameterCache'][key]==0 for key in ('hits','misses','hitBytes','fetchBytes','evictions'))
    for key,spec in expected.items():
        a=arrays[key];assert list(a.shape)==spec['shape'] and str(a.dtype)==spec['dtype']
        b=np.memmap(base/spec['file'],dtype=spec['dtype'],mode='r',shape=tuple(spec['shape']));maximum=0.;sum_abs=0.;different=0;nonzero=0;finite=True;digest=hashlib.sha256()
        af=a.reshape(-1);bf=b.reshape(-1)
        for first in range(0,a.size,262144):
            x=af[first:first+262144];y=bf[first:first+262144];digest.update(x.tobytes());maximum=max(maximum,float(np.max(np.abs(x.astype(np.float64)-y.astype(np.float64)))));different+=int(np.count_nonzero(x!=y));nonzero+=int(np.count_nonzero(x));sum_abs+=float(np.abs(x.astype(np.float64)-y.astype(np.float64)).sum());finite=finite and bool(np.isfinite(x).all())
        if 'sha256' in browser['records'][-1]['outputs'][key]:assert digest.hexdigest()==browser['records'][-1]['outputs'][key]['sha256']
        binary=key in ('mask','analyzed','candidates') or variant=='d2prl' and key!='map'
        accepted=finite and maximum<=tolerance and (not binary or different==0)
        records.append(dict(array=key,dtype=str(a.dtype),shape=list(a.shape),maxAbs=maximum,meanAbs=sum_abs/a.size,nonzero=nonzero,different=different,sha256=digest.hexdigest(),accepted=accepted))
report=dict(schema=1,status='passed' if all(r['accepted'] for r in records) else 'rejected',variant=variant,backend=backend,large=large,rich=rich,extracted=extracted,scope='Actual paged common-worker NPZ read with NumPy allow_pickle=False; ZIP CRC, owned export SHA, names/dtypes/shapes, canonical source identity, all native array values and browser window hashes.',bytes=file.stat().st_size,sha256=sha,numpy=np.__version__,records=records)
if backend=='webgpu' and 'numericalParity' in provenance.get('model',{}):
    assert provenance['kernelParity']==provenance['model']['numericalParity']
    report['kernelParity']=provenance['kernelParity']
report['floatTolerance']=tolerance
if browser.get('configuredGpu'):
    report['configuredGpu']=True
    report['exportBackend']=provenance['backend']
    report['backendSelection']=provenance['backendSelection']
(root/'docs'/(stem+'-npz-proof.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(status=report['status'],variant=variant,arrays=len(records))),flush=True)
if report['status']!='passed':sys.exit(1)
