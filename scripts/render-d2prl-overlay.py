"""Overlay the saved 8-bit probability display; no detector threshold is applied."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
folder = Path(__file__).resolve().parent / 'results/spiral-d2prl'
p = folder / 'result.json'
r = json.loads(p.read_text())
source = np.array(Image.open(root / r['job']['input']).convert('RGB'))
probability = np.array(Image.open(folder / 'result.png').convert('RGB'))[:, :, 0].astype(np.float64) / 255
alpha = probability[:, :, None] * .7
rgb = np.floor(source * (1-alpha) + np.array([230,170,30]) * alpha + .5).astype(np.uint8)
output = folder / 'overlay.png'
Image.fromarray(rgb).save(output)
sha = lambda b: hashlib.sha256(b).hexdigest()
r['outputs'] = [v for v in r['outputs'] if v['file'] != 'overlay.png']
r['outputs'].append(dict(file='overlay.png',view='probability-overlay',width=rgb.shape[1],height=rgb.shape[0],sha256=sha(output.read_bytes()),rawRgbSha256=sha(rgb.tobytes())))
r['presentation'] = {'overlay':'Yellow (230,170,30), opacity 0.7 times the saved 8-bit probability display / 255. Display only, no binary threshold or recomputation.','sourceDisplaySha256':sha((folder/'result.png').read_bytes())}
p.write_text(json.dumps(r,indent=2)+'\n')
