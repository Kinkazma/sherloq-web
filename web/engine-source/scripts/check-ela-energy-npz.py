"""Verify an actual engine NPZ against generated native arrays, without pickle.
Run tests/ela-energy-pipeline.test.mjs first to write the private export.
"""
from pathlib import Path
import gzip, hashlib, json, zipfile
import numpy as np

root = Path(__file__).resolve().parents[1]
export = root / '.build/ela-energy-export.npz'
reference = json.loads((root / 'fixtures/ela-energy/pipeline.json').read_text())
packed = (root / 'fixtures/ela-energy' / reference['payload']['file']).read_bytes()
assert hashlib.sha256(packed).hexdigest() == reference['payload']['compressedSha256']
payload = gzip.decompress(packed)
assert hashlib.sha256(payload).hexdigest() == reference['payload']['sha256']
row = next(r for r in reference['cases'] if r['source'] == 'composite' and r['params']['profile'] == 'standard')
with zipfile.ZipFile(export) as archive:
    assert archive.testzip() is None
arrays = {}
with np.load(export, allow_pickle=False) as output:
    for key in ['energy_planes', 'energy_low_score', 'energy_high_score', 'energy_scope', 'energy_labels']:
        part = row[key]
        expected = payload[part['offset']:part['offset'] + part['length']]
        actual = output[key]
        dtype = np.dtype('int32' if key in ['energy_scope', 'energy_labels'] else 'float32')
        shape = tuple(([3] if key == 'energy_planes' else []) + row['metadata']['image_shape'])
        assert actual.dtype == dtype and actual.shape == shape and actual.tobytes() == expected, key
        arrays[key] = dict(shape=shape, dtype=str(dtype), sha256=hashlib.sha256(expected).hexdigest())
    metadata = json.loads(str(output['metadata_json']))
    provenance = json.loads(str(output['browser_provenance_json']))
    assert metadata['regions'] == row['regions']
    assert metadata['energy']['panels'] == row['summary']
    assert metadata['energy']['quantiles'] == row['quantiles']
    assert metadata['energy']['thresholds'] == row['thresholds']
    assert provenance['operation'] == 'ela.energy'
    assert provenance['originalSha256'] == next(s['sha256'] for s in reference['sources'] if s['name'] == row['source'])
report = dict(schema=1, status='passed', scope='Actual Node engine NPZ read by NumPy with allow_pickle=False; generated composite fixture', numpy=np.__version__, arrays=arrays, regions=row['regions'], provenance=provenance, exportSha256=hashlib.sha256(export.read_bytes()).hexdigest())
(root / 'docs/ela-energy-npz-proof.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(status=report['status'], arrays=len(arrays), engine=provenance['engine'])))
