"""Native complete energy plane SHA; writes only M5 tests/data JSON."""
from pathlib import Path
import sys, json, hashlib, cv2 as cv, numpy as np
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.ela_energy import describe_energy
assert cv.__version__ == '4.11.0' and np.__version__ == '1.26.4'
cv.setNumThreads(1)
file = 'tests/data/tiff-stream/tiles-bigtiff.tiff'
image = cv.imread(str(root / file)); cases = []
for quality in [75, 99]:
    ok, encoded = cv.imencode('.jpg', image, [cv.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    decoded = cv.imdecode(encoded, cv.IMREAD_COLOR)
    energy = describe_energy(image, decoded)
    cases.append(dict(quality=quality, sha256=hashlib.sha256(memoryview(energy)).hexdigest()))
    del energy, decoded, encoded
    print(quality, flush=True)
(root / 'tests/data/energy-stream-native.json').write_text(json.dumps(dict(
    opencv=cv.__version__, numpy=np.__version__, file=file,
    width=image.shape[1], height=image.shape[0], cases=cases), indent=2) + '\n')
