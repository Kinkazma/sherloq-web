"""Independent NumPy readback of exports made by the actual browser model."""
from pathlib import Path
import hashlib, json, sys
import numpy as np
root = Path(__file__).resolve().parents[1]
variant = sys.argv[2] if len(sys.argv) > 2 else 'mgcfdn-mpdn'
assert variant in ('mgcfdn-mpdn', 'mgcfdn-16', 'mgcfdn', 'mgcfdn-st', 'mgcfdn-effnet', 'mgcfdn-tnt', 'mgcfdn-vig', 'cmseg-generalization', 'cmseg-addnoise')
base = root / '.build' / ('segmentation-zones' if variant == 'mgcfdn-mpdn' else 'segmentation-zones-' + variant)
report_stem = 'segmentation-mpdn' if variant == 'mgcfdn-mpdn' else 'segmentation-' + variant
reference = json.loads((base / 'reference.json').read_text())
prefix = sys.argv[1] if len(sys.argv) > 1 else 'browser'
assert prefix in ('browser', 'common', 'gpu-common', 'extracted', 'gpu-extracted')
if prefix.startswith('gpu-'): report_stem += '-gpu'
report_kind = 'zones' if prefix == 'browser' else 'extracted-worker' if prefix.endswith('extracted') else 'common-worker'
browser = json.loads((root / ('docs/' + report_stem + '-' + report_kind + '-chrome-proof.json')).read_text())
records = []
def read(spec):
    data = (base / spec['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest() == spec['sha256']
    return np.frombuffer(data, dtype=spec['dtype']).reshape(spec['shape'])
for item in browser['exports']:
    path = base / (prefix + '-' + item['name'] + '.npz')
    assert path.stat().st_size == item['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
    with np.load(path, allow_pickle=False) as package:
        metadata = json.loads(str(package['metadata_json']))
        provenance = json.loads(str(package['browser_provenance_json']))
        if prefix == 'browser':
            assert provenance['note'] == 'Public synthetic ROI — modèle CPU'
        else:
            assert provenance['originalSha256'] == reference['sourceFile']['sha256']
            assert provenance['operation'] == 'ai.clones.segmentation'
        assert metadata['boxes'] == [zone['bounds'] for zone in reference['zones']]
        if item['name'] == 'raw':
            side = reference.get('side', 256)
            assert metadata['raw_filter_applied'] is False and metadata['raw_shape'] == [3 if reference.get('kind') == 'softmax' else 1, side, side]
            expected = {'raw_probabilities': np.stack([read(z['raw']) for z in reference['zones']])}
        else:
            expected = {name: read(spec) for name, spec in reference['result'].items()}
        assert set(package.files) == set(expected) | {'metadata_json', 'browser_provenance_json'}
        for name, native in expected.items():
            actual = package[name]
            assert actual.shape == native.shape and actual.dtype == native.dtype
            delta = np.abs(actual.astype(np.float64) - native.astype(np.float64))
            records.append(dict(export=item['name'], array=name, shape=list(actual.shape), dtype=str(actual.dtype), different=int(np.count_nonzero(actual != native)), maxAbs=float(delta.max()), finite=bool(np.isfinite(actual).all())))
accepted = all(r['finite'] and (r['maxAbs'] <= 1e-4 if r['dtype'] == 'float32' else r['different'] == 0) for r in records)
report = dict(schema=1, status='passed-corpus-tolerance' if accepted else 'rejected', scope='Actual browser NPZ, independent NumPy allow_pickle=False; continuous values differ from native within reported errors, integer masks exact; Unicode metadata preserved', records=records, exports=browser['exports'])
(root / ('docs/' + report_stem + ('-extracted' if prefix.endswith('extracted') else '-common' if prefix.endswith('common') else '') + '-npz-proof.json')).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
assert accepted
