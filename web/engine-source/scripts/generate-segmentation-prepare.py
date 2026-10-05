"""Small public synthetic references for the CMSeg/MGCF native PIL pipeline.

No checkpoints, model execution, training or private images are used here.
"""
from pathlib import Path
import hashlib, json
import numpy as np
import PIL
from PIL import Image
import torch
import torchvision
from torchvision import transforms as T

root = Path(__file__).resolve().parents[1]
out = root / '.build/segmentation-preprocess'
out.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(1)
assert PIL.__version__ == '12.2.0'
assert torch.__version__.split('+')[0] == '2.8.0'
rng = np.random.default_rng(1202512)
records = []

def save(name, value):
    value = np.ascontiguousarray(value)
    data = value.tobytes()
    filename = name + '.bin'
    (out / filename).write_bytes(data)
    return dict(file=filename, shape=list(value.shape), dtype=str(value.dtype), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())

for height, width in [(1, 1), (1, 29), (31, 1), (8, 8), (257, 255), (389, 521), (512, 512), (769, 1031), (17, 4097)]:
    rgb = rng.integers(0, 256, (height, width, 3), dtype=np.uint8)
    if height > 1 and width > 1:
        rgb[height // 2:, width // 2:, 0] = 255
        rgb[:height // 2, :width // 2, 1] = 0
    source = save(f'{height}x{width}-rgb', rgb)
    for side in (256, 512):
        image = Image.fromarray(rgb)
        resized = T.Resize((side, side))(image)
        tensor = T.ToTensor()(resized).unsqueeze(0)
        name = f'{height}x{width}-to-{side}'
        records.append(dict(name=name, side=side, input=source, rgb=save(name + '-rgb', resized), tensor=save(name + '-nchw', tensor.numpy())))
source = root.parent / 'source/gui/sherloq_app/core/clone_models.py'
report = dict(schema=1, scope='Native PIL RGB8 Resize then ToTensor only; no codec or model qualification', pillow=PIL.__version__, torch=torch.__version__, torchvision=torchvision.__version__, nativeSourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), records=records)
(out / 'reference.json').write_text(json.dumps(report, indent=2) + '\n')
print('Generated', len(records), 'segmentation preparation cases')
