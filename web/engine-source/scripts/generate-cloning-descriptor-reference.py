"""Native Hamming ordering across batch and descriptor-tail boundaries."""
from pathlib import Path
import json
import cv2 as cv
import numpy as np

assert cv.__version__ == '4.11.0' and np.__version__ == '1.26.4'
root = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(260004)
cases = []
for stride in [32, 61]:
    for kind in ['last-byte', 'ties', 'random']:
        count = 3 if kind == 'last-byte' else 131
        descriptors = np.zeros((count, stride), dtype=np.uint8)
        if kind == 'last-byte':
            descriptors[:, -1] = [0, 1, 255]
        elif kind == 'ties':
            descriptors[:, -1] = np.arange(count, dtype=np.uint8) % 16
        else:
            descriptors[:] = rng.integers(0, 256, descriptors.shape, dtype=np.uint8)
        for radius in ([1, 7, 8] if kind == 'last-byte' else [2.55, 5.1, 127.5, 255]):
            matches = []
            for start in range(0, count, 64):
                rows = cv.BFMatcher(cv.NORM_HAMMING).radiusMatch(descriptors[start:start+64], descriptors, float(radius))
                for row in rows:
                    for match in row:
                        query = start + match.queryIdx
                        if query != match.trainIdx:
                            matches.extend([query, match.trainIdx, match.distance])
            cases.append(dict(stride=stride, kind=kind, radius=radius, descriptors=descriptors.ravel().tolist(), matches=matches))
out = root/'fixtures/cloning-descriptors.json'
out.write_text(json.dumps(dict(schema=1, opencv=cv.__version__, numpy=np.__version__, seed=260004, cases=cases), separators=(',', ':'))+'\n')
print(len(cases), 'native Hamming boundary cases')
