"""Isolated response selection and ordered Hamming oracle, no private images."""
from pathlib import Path
import json, sys
import numpy as np
import cv2 as cv
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent/'source'))
from gui.sherloq_app.core.cloning import ordered_matches
assert np.__version__ == '1.26.4' and cv.__version__ == '4.11.0'
out = root/'.build/cloning-study'
reference = json.loads((out/'reference.json').read_text())
records = []
for image in reference['images']:
    for case in image['results']:
        if case['algorithm'] != 1 or 'error' in case: continue
        points = np.fromfile(out/case['points'], '<f8').reshape(-1, 7)
        desc = np.fromfile(out/case['descriptors'], np.uint8).reshape(-1, case['descriptorSize'])
        normalized = cv.normalize(points[:, 4], None, 0, 100, cv.NORM_MINMAX).ravel() if len(points) else np.array([])
        for response in [0, 50, 90, 100]:
            selected = np.flatnonzero(normalized >= 100-response)
            records.append(dict(image=image['name'], mask=case['mask'], response=response, selected=selected.tolist()))
matching = []
rng = np.random.default_rng(250002)
for count in [0, 1, 2, 8, 24, 25, 26, 32, 33, 64, 65, 128, 500]:
    for mode in ['random', 'ties']:
        desc = rng.integers(0, 256, (count, 32), dtype=np.uint8) if mode == 'random' else np.repeat((np.arange(count)%5).astype(np.uint8)[:, None], 32, axis=1)
        file = f'match-{mode}-{count}.desc'; desc.tofile(out/file)
        for radius in [2.55, 51, 127.5, 255]:
            values = ordered_matches(desc, radius)
            prefix = f'match-{mode}-{count}-{radius}.f64'; values.astype('<f8').tofile(out/prefix)
            matching.append(dict(file=file, count=count, stride=32, radius=radius, matches=prefix, matchCount=len(values)))
(out/'matches-reference.json').write_text(json.dumps(dict(selection=records, matching=matching), indent=2)+'\n')
print(len(records), 'selection cases;', len(matching), 'ordered Hamming cases')
