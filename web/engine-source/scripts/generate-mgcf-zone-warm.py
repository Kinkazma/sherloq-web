"""Reuse native zone oracles; change one public source pixel outside every crop."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
for variant in ('mgcfdn', 'mgcfdn-st'):
    base = root / '.build' / ('segmentation-zones-' + variant)
    reference = json.loads((base / 'reference.json').read_text())
    spec = reference['source']
    rgb = np.fromfile(base / spec['file'], np.uint8).reshape(spec['shape'])
    assert hashlib.sha256(rgb.tobytes()).hexdigest() == spec['sha256']
    assert np.array_equal(np.asarray(Image.open(base / reference['sourceFile']['file']).convert('RGB')), rgb)
    assert all(z['bounds'][0] > 0 or z['bounds'][1] > 0 for z in reference['zones'])
    out = root / '.build' / 'mgcf-zone-benchmark' / variant
    out.mkdir(parents=True, exist_ok=True)
    records = []
    for run in range(3):
        changed = rgb.copy()
        changed[0, 0, 0] = (int(rgb[0, 0, 0]) + run) % 256
        for zone in reference['zones']:
            x0, y0, x1, y1 = zone['bounds']
            assert np.array_equal(changed[y0:y1, x0:x1], rgb[y0:y1, x0:x1])
        file = out / ('source-' + str(run) + '.png')
        Image.fromarray(changed).save(file)
        data = file.read_bytes()
        records.append(dict(run=run, file=file.name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), pixelSha256=hashlib.sha256(changed.tobytes()).hexdigest()))
    report = dict(schema=1, variant=variant, referenceSha256=hashlib.sha256((base / 'reference.json').read_bytes()).hexdigest(), scope='Three public PNG inputs; identical native ROI pixels, one RGB component outside every zone differs between useful cold/warm jobs. No new native inference or changed oracle.', records=records)
    (out / 'inputs.json').write_text(json.dumps(report, indent=2) + '\n')
    print(variant, 'three identical-crop inputs')
