"""Native streamed-cell qualification; only own M5 tests/data outputs."""
from pathlib import Path
import sys, json, hashlib, cv2 as cv, numpy as np
root = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.ela_biomes import describe
assert cv.__version__ == '4.11.0' and np.__version__ == '1.26.4'
cv.setNumThreads(1)
file = 'tests/data/recompression-segmented-parallel.jpg'; image = cv.imread(str(root / file))
payload = bytearray(); cases = []
for quality in [75, 80]:
    decoded = cv.imdecode(cv.imencode('.jpg', image, [cv.IMWRITE_JPEG_QUALITY, quality])[1], cv.IMREAD_COLOR)
    arrays = describe(image, decoded, 32, lambda: False, background=True); fields = {}
    for key, data in zip(['content', 'profiles', 'usable', 'background'], arrays):
        raw = data.astype('u1' if key == 'usable' else '<f4').tobytes()
        fields[key] = dict(offset=len(payload), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        payload.extend(raw)
    cases.append(dict(quality=quality, block=32, fields=fields)); print(quality, flush=True)
(root / 'tests/data/ela-cell-stream-native.bin').write_bytes(payload)
(root / 'tests/data/ela-cell-stream-native.json').write_text(json.dumps(dict(file=file,
    width=image.shape[1], height=image.shape[0], opencv=cv.__version__, numpy=np.__version__,
    payloadSha256=hashlib.sha256(payload).hexdigest(), cases=cases), indent=2) + '\n')
