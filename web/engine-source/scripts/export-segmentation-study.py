"""Offline model conversion and native references; never imported by the app.

The official local adapter verifies checkpoint and code hashes, loads strictly,
and runs the unchanged network. Generated models/references stay in .build.
"""
from pathlib import Path
import argparse, collections, hashlib, json, sys, time
import numpy as np
import cv2 as cv
import torch
import torch.utils.model_zoo
import onnx
from PIL import Image
from torchvision import transforms as T

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation

variants = {
    'cmseg-generalization': 'CMSeg-Net generalization',
    'cmseg-addnoise': 'CMSeg-Net addnoise',
    'mgcfdn': 'MGCFDN',
    'mgcfdn-st': 'MGCFDN source/cible',
    'mgcfdn-16': 'MGCFDN 16×16',
    'mgcfdn-effnet': 'MGCFDN EffNet 16×16',
    'mgcfdn-mpdn': 'MGCFDN MPDN 16×16',
    'mgcfdn-tnt': 'MGCFDN TNT 16×16',
    'mgcfdn-vig': 'MGCFDN VIG 16×16',
}
parser = argparse.ArgumentParser()
parser.add_argument('variant', choices=variants)
args = parser.parse_args()
assert torch.__version__.split('+')[0] == '2.8.0' and onnx.__version__ == '1.19.0'
def denied(*args, **kwargs):
    raise RuntimeError('Offline conversion prohibits downloads')
torch.hub.download_url_to_file = denied
torch.utils.model_zoo.load_url = denied
torch.set_num_threads(8)
torch.manual_seed(1)
loaded = load_segmentation(variants[args.variant], 'cpu')
out = root / '.build/segmentation-models' / args.variant
out.mkdir(parents=True, exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()

def save(name, array):
    if isinstance(array, torch.Tensor):
        array = array.detach().cpu().numpy()
    array = np.ascontiguousarray(array)
    data = array.tobytes()
    filename = name + '.bin'
    (out / filename).write_bytes(data)
    return dict(file=filename, shape=list(array.shape), dtype=str(array.dtype), bytes=len(data), sha256=sha(data))

class Network(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.network = loaded['model']
    def forward(self, rgb):
        logits = self.network(rgb)
        return logits, logits.softmax(1) if loaded['kind'] == 'softmax' else logits.sigmoid()

network = Network().eval()
h, w = 389, 521
y, x = np.indices((h, w))
rng = np.random.default_rng(120256)
rgb = np.stack([(x * 7 + y * 3) % 256, (x // 11 * 37 + y // 9 * 23) % 256, ((x - y) ** 2) % 256], axis=2).astype(np.uint8)
rgb ^= rng.integers(0, 16, rgb.shape, dtype=np.uint8)
rgb[230:320, 330:450] = rgb[50:140, 70:190]
inputs = [('structured-copy', rgb), ('constant', np.full((97, 151, 3), 127, np.uint8))]
# Paired synthetic dark spots exercise a positive native mask (MPDN), unlike
# the two mostly-negative examples above. No private/public photograph is used.
by, bx = np.indices((256, 256))
blots = np.full((256, 256), 225., np.float32)
for cx, cy, sx, sy in [(50, 55, 15, 8), (95, 60, 10, 8), (155, 170, 15, 8), (200, 175, 10, 8)]:
    blots -= 180 * np.exp(-((bx - cx) ** 2 / (2 * sx * sx) + (by - cy) ** 2 / (2 * sy * sy)))
inputs.append(('paired-spots', np.repeat(np.clip(blots, 0, 255).astype(np.uint8)[:, :, None], 3, 2)))
if args.variant == 'mgcfdn-st':
    # Branch-coverage fixture: both native role classes are positive. The
    # exploratory generated cases/counts are retained separately, not accuracy
    # benchmarks and never used to fit weights or alter thresholds.
    role_rng = np.random.default_rng(192)
    field = sum(cv.resize(role_rng.random((s, s, 3), dtype=np.float32), (256, 256), interpolation=cv.INTER_CUBIC) / 4 for s in (4, 8, 16, 32))
    role_rgb = np.clip(field * 255, 0, 255).astype(np.uint8)
    role_rgb[146:226, 146:226] = role_rgb[20:100, 20:100]
    inputs.append(('multiscale-copy', role_rgb))
    role_canvas = np.full((389, 521, 3), 225, np.uint8)
    role_canvas[20:276, 20:276] = role_rgb
    inputs.extend([('partial-copy', role_canvas[80:336, 100:356]), ('envelope-copy', role_canvas[12:344, 12:364])])
records = []
for name, rgb in inputs:
    tensor = T.Compose([T.Resize((loaded['side'], loaded['side'])), T.ToTensor()])(Image.fromarray(rgb))[None]
    start = time.monotonic()
    with torch.inference_mode():
        logits, probability = network(tensor)
    assert torch.isfinite(logits).all() and torch.isfinite(probability).all()
    record = dict(name=name, rgb=save(name + '-rgb', rgb), input=save(name + '-input', tensor), logits=save(name + '-logits', logits), probability=save(name + '-probability', probability), nativeSeconds=time.monotonic() - start)
    p = probability[0].numpy()
    grid_map = p[0] + p[1] if loaded['kind'] == 'softmax' else p[0]
    grid_mask = ((p[0] >= .5) | (p[1] >= .5) if loaded['kind'] == 'softmax' else p[0] > .5).astype(np.uint8)
    size = (rgb.shape[1], rgb.shape[0])
    record.update(gridMap=save(name + '-grid-map', grid_map), gridMask=save(name + '-grid-mask', grid_mask), sourceMap=save(name + '-source-map', cv.resize(grid_map, size, interpolation=cv.INTER_LINEAR)), sourceMask=save(name + '-source-mask', cv.resize(grid_mask, size, interpolation=cv.INTER_NEAREST)))
    if loaded['kind'] == 'softmax':
        record.update(target=save(name + '-target', cv.resize(p[0], size, interpolation=cv.INTER_LINEAR)), source=save(name + '-source', cv.resize(p[1], size, interpolation=cv.INTER_LINEAR)))
    records.append(record)
    print(name, 'native reference written', flush=True)

sample = torch.from_numpy(np.fromfile(out / records[0]['input']['file'], np.float32).reshape(records[0]['input']['shape']))
target = out / 'unfolded.onnx'
with torch.inference_mode():
    torch.onnx.export(network, sample, target, input_names=['rgb'], output_names=['logits', 'probability'], opset_version=18, dynamo=False, external_data=False, do_constant_folding=False)
graph = onnx.load(target)
# Exporter debug stacks may contain host paths; they are not model arithmetic.
def remove_debug_strings(message):
    if hasattr(message, 'doc_string'):
        message.doc_string = ''
    for field, value in message.ListFields():
        if field.type == field.TYPE_MESSAGE:
            if field.label == field.LABEL_REPEATED:
                for child in value:
                    remove_debug_strings(child)
            else:
                remove_debug_strings(value)
remove_debug_strings(graph)
onnx.checker.check_model(graph)
onnx.save(graph, target)
assert b'/Users/' not in target.read_bytes()
report = dict(schema=1, status='unqualified-conversion', variant=variants[args.variant], side=loaded['side'], kind=loaded['kind'], weights=loaded['weights'], torch=torch.__version__, onnx=onnx.__version__, referenceThreads=8, model=dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target.read_bytes())), operators=dict(collections.Counter(n.op_type for n in graph.graph.node)), records=records, nativeAdapterSha256=sha((root.parent / 'source/gui/sherloq_app/core/clone_models.py').read_bytes()), scriptSha256=sha(Path(__file__).read_bytes()))
(out / 'reference.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ('status', 'variant', 'model', 'operators')}), flush=True)
