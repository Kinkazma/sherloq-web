"""Real native adapter on three independent crops of a generated RGB canvas."""
from pathlib import Path
import hashlib, json, sys
import numpy as np
import torch
from PIL import Image

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
from gui.sherloq_app.core.clone_detectors import analyze
torch.set_num_threads(8)
variant = sys.argv[1] if len(sys.argv) > 1 else 'mgcfdn-mpdn'
assert variant in ('mgcfdn-mpdn', 'mgcfdn-16', 'mgcfdn', 'mgcfdn-st', 'mgcfdn-effnet', 'mgcfdn-tnt', 'mgcfdn-vig', 'cmseg-generalization', 'cmseg-addnoise')
base = root / '.build/segmentation-models' / variant
cmseg = variant.startswith('cmseg-')
ref = json.loads((base / ('split-reference.json' if cmseg else 'reference.json')).read_text())
native_variant = 'CMSeg-Net ' + variant.removeprefix('cmseg-') if cmseg else ref['variant']
spec = next(r for r in ref['records'] if r['name'] == ('blobs-copy' if cmseg else 'multiscale-copy' if variant == 'mgcfdn-st' else 'paired-spots'))['rgb']
data = (base / spec['file']).read_bytes()
assert hashlib.sha256(data).hexdigest() == spec['sha256']
side = 512 if cmseg else 256
source = np.full((640, 768, 3) if cmseg else (389, 521, 3), 225, np.uint8)
source[20:20+side, 20:20+side] = np.frombuffer(data, np.uint8).reshape(spec['shape'])
out = root / '.build' / ('segmentation-zones' if variant == 'mgcfdn-mpdn' else 'segmentation-zones-' + variant)
out.mkdir(exist_ok=True)
loaded = load_segmentation(native_variant, 'cpu')
class SingleModel:
    def get(self, variant, requested):
        assert variant == native_variant and requested == 'cpu'
        return loaded, True
def save(name, array):
    array = np.ascontiguousarray(array)
    data = array.tobytes()
    filename = name + '.bin'
    (out / filename).write_bytes(data)
    return dict(file=filename, shape=list(array.shape), dtype=str(array.dtype), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
bounds = [[20, 20, 20+side, 20+side], [100, 80, 100+side, 80+side], [12, 12, 108+side, 88+side]]
regions = [[[x0, y0], [x1 - 1, y0], [x1 - 1, y1 - 1], [x0, y1 - 1]] for x0, y0, x1, y1 in bounds]
result = analyze(source[:, :, ::-1].copy(), dict(variant=native_variant, regions=regions), 'cpu', SingleModel())
record = dict(schema=1, scope='Native adapter, two independent ROI and envelope on a public synthetic source; no expected tensors used as inference inputs', variant=native_variant, kind=loaded['kind'], side=loaded['side'], weights=loaded['weights'], source=save('source-rgb', source), zones=[dict(id=name, kind='envelope' if index == 2 else 'region', bounds=b, raw=save('raw-' + str(index), result['raw_probabilities'][index])) for index, (name, b) in enumerate(zip(['roi-a', 'roi-b', 'envelope'], bounds))], result={name: save(name, result[name]) for name in ['map', 'mask', 'candidates', 'analyzed'] + (['target', 'source'] if loaded['kind'] == 'softmax' else [])}, metadata=result['metadata'])
without = analyze(source[:, :, ::-1].copy(), dict(variant=native_variant, regions=regions[:2]), 'cpu', SingleModel())
record['withoutEnvelope'] = {name: save('without-envelope-' + name, without[name]) for name in ['map', 'mask', 'candidates', 'analyzed'] + (['target', 'source'] if loaded['kind'] == 'softmax' else [])}
Image.fromarray(source).save(out / 'source.png')
png = (out / 'source.png').read_bytes()
record['sourceFile'] = dict(file='source.png', bytes=len(png), sha256=hashlib.sha256(png).hexdigest())
# A second requested source changes only a pixel outside every analyzed crop.
# Its model inputs remain identical, but its source digest forces real warm
# session inference instead of returning cached raw grids.
last_y,last_x = source.shape[0]-1,source.shape[1]-1
assert all(not (b[0] <= last_x < b[2] and b[1] <= last_y < b[3]) for b in bounds)
warm_source = source.copy(); warm_source[last_y, last_x] = [17, 29, 43]
Image.fromarray(warm_source).save(out / 'source-warm.png')
warm_png = (out / 'source-warm.png').read_bytes()
record['warmSourceFile'] = dict(file='source-warm.png', bytes=len(warm_png), sha256=hashlib.sha256(warm_png).hexdigest())
(out / 'reference.json').write_text(json.dumps(record, indent=2) + '\n')
print('Three native ROI inferences complete; foreground', int(result['mask'].sum()), flush=True)
