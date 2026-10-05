# Adapted from M2 commit 1040c53, source SHA256 a84f733b6d3dcc82ac9186417ab7efad8f9169fb2feea0c86e74acdcc6a8c0b7.
# CM2 uses the original n16 / n16rot checkpoint, never the tuned Blot checkpoint.
"""Export the native CM2 ALIKED DKD and SDDH heads, retaining dynamic H/W/N.

The host selects NMS indices; local patches are gathered without the native
25*H*W unfold allocation. The equations and trained descriptor weights stay
those of the reference implementation. Empty selections bypass these graphs.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import numpy as np
import torch
import torch.nn.functional as F

p = argparse.ArgumentParser()
p.add_argument('--native-root', type=Path, default=Path(__file__).resolve().parents[2])
p.add_argument('--kind',choices=['aliked-n16','aliked-n16rot'],default='aliked-n16')
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / '.build/m3/learned'
sys.path.insert(0, str(a.native_root / 'source'))
from gui.sherloq_app.vendor.lightglue.aliked import ALIKED, simple_nms, get_patches
ROOT = a.native_root
def verified(path):
 identity=next(row for row in json.loads((path.parent/'manifest.json').read_text()) if row['file']==path.name)
 sha=hashlib.sha256(path.read_bytes()).hexdigest()
 assert sha==identity['sha256'],path.name
 return path,sha
import onnx

torch.set_num_threads(2)
weight, weight_sha = verified(ROOT / 'models/external' / f'{a.kind}.pth')
model = ALIKED(model_name=a.kind, max_num_keypoints=-1).eval()

class Detection(torch.nn.Module):
    def forward(self, scores):
        return simple_nms(scores, 2), scores.mean()

class Localize(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('grid', model.dkd.hw_grid)

    def forward(self, scores, indices):
        h, w = scores.shape[-2:]
        xy = torch.stack((indices % w, torch.div(indices, w, rounding_mode='trunc')), dim=1)
        # Border removal guarantees that all 25 score samples are in bounds.
        positions = xy[:, None] + self.grid.long()[None]
        patch = scores[0, 0, positions[:, :, 1], positions[:, :, 0]]
        ex = ((patch - patch.amax(dim=1, keepdim=True)) / .1).exp()
        residual = ex @ self.grid / ex.sum(dim=1, keepdim=True)
        wh = torch._shape_as_tensor(scores)[-2:].flip(0).to(scores.dtype) - 1
        keypoints = (xy + residual) / wh * 2 - 1
        confidence = F.grid_sample(scores, keypoints.reshape(1, 1, -1, 2), mode='bilinear', align_corners=True)[0, 0, 0]
        dispersion = (ex * (torch.norm((self.grid[None] - residual[:, None]) / 2, dim=-1) ** 2)).sum(dim=1) / ex.sum(dim=1)
        return keypoints, confidence, dispersion

class Descriptor(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.head = model.desc_head

    def forward(self, features, keypoints):
        h, w = features.shape[-2:]
        wh = torch._shape_as_tensor(features)[-2:].flip(0).to(features.dtype) - 1
        bound = torch._shape_as_tensor(features)[-2:].amax().to(features.dtype) / 4
        pixels = (keypoints / 2 + .5) * wh
        patch = get_patches(features[0], pixels.long(), 3)
        n = keypoints.shape[0]
        offset = self.head.offset_conv(patch).clamp(-bound, bound)[:, :, 0, 0].reshape(n, 2, 16).permute(0, 2, 1)
        positions = (2 * (pixels[:, None] + offset) / wh - 1).reshape(1, -1, 1, 2)
        sampled = F.grid_sample(features, positions, mode='bilinear', align_corners=True).reshape(128, n, 16, 1).permute(1, 0, 2, 3)
        projected = F.selu(self.head.sf_conv(sampled)).squeeze(-1)
        descriptors = torch.einsum('ncp,pcd->nd', projected, self.head.agg_weights)
        return F.normalize(descriptors, p=2, dim=1), offset

def indices_for(scores):
    nms = simple_nms(scores, 2).clone()
    nms[:, :, :2] = 0; nms[:, :, -2:] = 0
    nms[:, :, :, :2] = 0; nms[:, :, :, -2:] = 0
    mask = nms > .2
    if not mask.any(): mask = nms > scores.mean()
    indices = mask.flatten().nonzero()[:, 0]
    if len(indices) > 20000:
        indices = indices[scores.flatten()[indices].sort(descending=True)[1][:20000]]
    return indices

dense = json.loads((out / f'{a.kind}-dense-reference.json').read_text())
cases = []
heads = {'detect': Detection(), 'localize': Localize(), 'describe': Descriptor()}
graphs = {}
with torch.inference_mode():
    for case in dense['cases']:
        def read(name):
            item = case['files'][name]
            return torch.from_numpy(np.fromfile(out / item['file'], dtype='<f4').reshape(item['shape']))
        features, scores = read('features'), read('scores')
        indices = indices_for(scores)
        native_k, native_s, native_d = model.dkd(scores)
        native_desc, native_offset = model.desc_head(features, native_k)
        k, s, d = heads['localize'](scores, indices)
        desc, offset = heads['describe'](features, k)
        # Equivalent wrappers must agree before testing conversion.
        for actual, expected in [(k,native_k[0]), (s,native_s[0]), (d,native_d[0]), (desc,native_desc[0]), (offset,native_offset[0])]:
            torch.testing.assert_close(actual, expected, rtol=0, atol=0)
        files = dict(case['files'])
        for name, tensor in [('indices',indices),('keypoints',native_k[0]),('confidence',native_s[0]),('dispersion',native_d[0]),('descriptors',native_desc[0]),('offset',native_offset[0])]:
            suffix = 'i64' if name == 'indices' else 'f32'
            filename = f"{a.kind}-heads-{case['id']}-{name}.{suffix}"
            tensor.numpy().astype('<i8' if suffix == 'i64' else '<f4').tofile(out / filename)
            files[name] = dict(file=filename, shape=list(tensor.shape))
        cases.append(dict(id=case['id'], files=files))
        if not graphs:
            definitions = [
                ('detect',(scores,),['scores'],['nms','mean'],{'scores':{2:'h',3:'w'},'nms':{2:'h',3:'w'}}),
                ('localize',(scores,indices),['scores','indices'],['keypoints','confidence','dispersion'],{'scores':{2:'h',3:'w'},'indices':{0:'n'},'keypoints':{0:'n'},'confidence':{0:'n'},'dispersion':{0:'n'}}),
                ('describe',(features,k),['features','keypoints'],['descriptors','offset'],{'features':{2:'h',3:'w'},'keypoints':{0:'n'},'descriptors':{0:'n'},'offset':{0:'n'}}),
            ]
            for name, inputs, names, outputs, axes in definitions:
                path = out / f'{a.kind}-{name}.onnx'
                torch.onnx.export(heads[name].eval(), inputs, path, input_names=names, output_names=outputs, dynamic_axes=axes, opset_version=19, dynamo=False, external_data=False)
                onnx.checker.check_model(onnx.load(path))
                graphs[name] = dict(file=path.name, bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
report = dict(schema=1, torch=torch.__version__, checkpointSha256=weight_sha, graphs=graphs, cases=cases)
(out/f'{a.kind}-heads-reference.json').write_text(json.dumps(report, separators=(',',':'))+'\n')
print(json.dumps(dict(graphs=graphs, counts=[c['files']['indices']['shape'][0] for c in cases])))
