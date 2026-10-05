"""Public synthetic NumPy/OpenCV Fourier reference, with native gray byte LUT.

Run with the unchanged native Python environment. No photographs or model weights.
Binary records are little-endian, compressed once with reproducible gzip metadata.
"""
from pathlib import Path
import gzip, hashlib, itertools, json, sys
import cv2 as cv
import matplotlib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'source'))
from gui.sherloq_app.core.resampling import ResamplingEngine, normalize_gray
assert (np.__version__, cv.__version__, matplotlib.__version__) == ('1.26.4', '4.11.0', '3.8.4')
out = ROOT / 'fixtures/resampling'
out.mkdir(exist_ok=True)
payload = bytearray()
def record(a, dtype='<f8'):
    b = np.asarray(a, dtype=dtype).tobytes()
    r = dict(offset=len(payload), bytes=len(b), shape=list(a.shape), dtype=dtype,
             sha256=hashlib.sha256(b).hexdigest())
    payload.extend(b)
    return r
primitives = []
for kind, seed, shapes in [
    ('fft', 240002, [(2,2),(3,5),(8,8),(16,16),(32,48),(31,37),(64,64),(128,128),(256,256)]),
    ('pyrup', 240003, [(1,1),(2,2),(3,5),(8,8),(17,23),(32,32),(64,64)])]:
    rng = np.random.default_rng(seed)
    for shape in shapes:
        a = rng.uniform(0, 1, shape)
        b = np.fft.fft2(a) if kind == 'fft' else cv.pyrUp(a)
        primitives.append(dict(kind=kind, source=record(a), expected=record(b, '<c16' if kind == 'fft' else '<f8')))

def run_cases(array, combinations, rect=None):
    engine = ResamplingEngine(array)
    selected = array if rect is None else array[rect[1]:rect[3], rect[0]:rect[2]]
    results = []
    for params in combinations:
        p = dict(zip(['window','upsample','center','highpass','gamma','rescale'], params))
        if rect is not None:
            p['rect'] = rect
        item = dict(params=p)
        try:
            values = engine.fourier(selected, str(rect), params)
            # Native UI uses imshow(..., cmap='gray', vmin=0, vmax=1).
            rgb = matplotlib.colormaps['gray'](values, bytes=True)[:, :, :3]
            item.update(values=record(values), rgb=record(rgb, 'u1'), peak=int(np.argmax(values)))
        except ValueError as error:
            item['error'] = str(error)
        results.append(item)
    return results

rng = np.random.default_rng(240004)
fields = [('tiny',rng.uniform(0,1,(2,3))),('odd',rng.uniform(0,1,(7,9))),
          ('random',rng.uniform(0,1,(16,20))),('prime',rng.uniform(0,1,(31,37))),
          ('large',rng.uniform(0,1,(64,80))),('zero',np.zeros((16,16))),
          ('flat',np.full((16,16),.5)),('gradient',np.arange(1024).reshape(32,32)/1023)]
params = list(itertools.product(['hanning','radial'],[False,True],[False,True],['simple','radial'],[0,.1,1,4],[False,True]))
kernels = [dict(name=name, source=record(a), cases=run_cases(a,params)) for name,a in fields]
images = []
for name in ['synthetic.jpg','odd.jpg','gray.jpg','progressive.jpg','exif-6-le.jpg',
             'quality-model/raw.png','quality-model/gray16.png','quality-model/rgb16.tiff','quality-model/constant.png']:
    path = ROOT / 'fixtures' / name
    gray = cv.imread(str(path), cv.IMREAD_GRAYSCALE)
    normalized = normalize_gray(gray)
    h,w = gray.shape
    rect = [max(0,w//5),max(0,h//5),w-1,h-1]
    selected = [params[i] for i in [0,7,19,37,55,64,77,91,109,127]]
    cases = run_cases(normalized, selected)
    cases += run_cases(normalized, selected, rect)
    images.append(dict(file=name,originalSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       gray=record(gray,'u1'),normalized=record(normalized),
                       minimum=int(gray.min()),maximum=int(gray.max()),cases=cases))
compressed = gzip.compress(payload, mtime=0)
(out/'reference.bin.gz').write_bytes(compressed)
reference = dict(schema=1, source='Public generated fields and synthetic JPEG/PNG/TIFF; no private images',
                 nativeSourceSha256=hashlib.sha256((ROOT.parent/'source/gui/sherloq_app/core/resampling.py').read_bytes()).hexdigest(),
                 numpy=np.__version__,opencv=cv.__version__,matplotlib=matplotlib.__version__,
                 payload=dict(file='reference.bin.gz',bytes=len(payload),compressedBytes=len(compressed),
                              sha256=hashlib.sha256(payload).hexdigest(),compressedSha256=hashlib.sha256(compressed).hexdigest()),
                 primitives=primitives,kernels=kernels,images=images)
(out/'reference.json').write_text(json.dumps(reference,indent=2)+'\n')
print(json.dumps(dict(primitives=len(primitives),kernelCases=sum(len(x['cases']) for x in kernels),
                      imageCases=sum(len(x['cases']) for x in images),bytes=len(payload),compressedBytes=len(compressed))))
