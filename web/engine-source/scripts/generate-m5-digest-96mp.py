"""Independent full-source OpenCV/hashlib references; no product calibration."""
from pathlib import Path
import hashlib
import json
import time
import cv2 as cv

root = Path(__file__).resolve().parents[1]
source = root.parent / 'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'
assert cv.__version__ == '4.11.0'
cv.setNumThreads(1)
started = time.perf_counter()
names = {'MD5': 'md5', 'SHA-1': 'sha1', **{f'SHA2-{n}': f'sha{n}' for n in [224, 256, 384, 512]}, **{f'SHA3-{n}': f'sha3_{n}' for n in [224, 256, 384, 512]}}
states = {name: hashlib.new(algorithm) for name, algorithm in names.items()}
with source.open('rb') as stream:
    while chunk := stream.read(4 * 1024**2):
        for state in states.values():
            state.update(chunk)
hashes = {name: state.hexdigest() for name, state in states.items()}
assert hashes['SHA2-256'] == '7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca'
image = cv.imread(str(source))
assert image.shape == (8000, 12000, 3)
algorithms = [('Average', cv.img_hash.averageHash), ('Block mean', cv.img_hash.blockMeanHash), ('Color moments', cv.img_hash.colorMomentHash), ('Marr-Hildreth', cv.img_hash.marrHildrethHash), ('pHash', cv.img_hash.pHash), ('Radial variance', cv.img_hash.radialVarianceHash)]
visual = {}
for name, function in algorithms:
    visual[name] = function(image).ravel().tolist()
    print(name, 'complete', flush=True)
report = dict(width=12000, height=8000, sourceBytes=source.stat().st_size, sha256=hashes['SHA2-256'], hashes=hashes, imageHashes=visual, opencv=cv.__version__, nativeSeconds=time.perf_counter()-started, complexity='Original rich JPEG with seeded noise and distant copied boxes; no source resize before the native hash algorithms.')
(root / 'docs/m5-digest-96mp-native-reference.json').write_text(json.dumps(report, indent=2)+'\n')
