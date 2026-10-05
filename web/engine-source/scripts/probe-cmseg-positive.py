"""Find a public synthetic positive case for CMSeg-Net decision coverage.

All generated cases and counts are recorded, including negative cases. This is
branch coverage, not a sensitivity/specificity benchmark or model tuning.
"""
from pathlib import Path
import json, sys
import numpy as np
import cv2 as cv
import torch
from PIL import Image
from torchvision.transforms.functional import to_tensor
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
torch.set_num_threads(8)
model = load_segmentation('CMSeg-Net generalization', 'cpu')['model']
out = root / '.build/cmseg-coverage'
out.mkdir(exist_ok=True)
records = []
for kind in ('multiscale', 'smooth', 'bands', 'blobs'):
    for seed in (192,):
        rng = np.random.default_rng(seed)
        if kind == 'multiscale':
            field = sum(cv.resize(rng.random((s, s, 3), dtype=np.float32), (512, 512), interpolation=cv.INTER_CUBIC) / 4 for s in (4, 8, 16, 32))
        elif kind == 'smooth':
            field = cv.GaussianBlur(rng.random((512, 512, 3), dtype=np.float32), (0, 0), 2)
            field = (field - field.min()) / (field.max() - field.min())
        elif kind == 'bands':
            y, x = np.indices((512, 512))
            field = np.stack([np.sin(x / 11 + y / 23), np.sin(x / 19 - y / 13), np.cos(x / 7 + y / 15)], axis=2) * .3 + .5
            field += rng.random(field.shape, dtype=np.float32) * .04
        else:
            field = np.full((512, 512, 3), .7, np.float32)
            for _ in range(24):
                x, y, radius = rng.integers(0, 512), rng.integers(0, 512), rng.integers(7, 28)
                cv.circle(field, (int(x), int(y)), int(radius), tuple(map(float, rng.random(3))), -1)
            field = cv.GaussianBlur(field, (0, 0), 1)
        rgb = np.clip(field * 255, 0, 255).astype(np.uint8)
        rgb[292:452, 292:452] = rgb[40:200, 40:200]
        with torch.inference_mode():
            p = model(to_tensor(Image.fromarray(rgb))[None]).sigmoid()[0].numpy()
        name = kind + '-' + str(seed)
        Image.fromarray(rgb).save(out / (name + '.png'))
        np.save(out / (name + '-probability.npy'), p, allow_pickle=False)
        record = dict(name=name, foreground=int((p[0] > .5).sum()), maximum=float(p.max()))
        records.append(record)
        print(json.dumps(record), flush=True)
(out / 'report.json').write_text(json.dumps(dict(scope=__doc__, records=records), indent=2) + '\n')
