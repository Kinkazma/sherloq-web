"""Export public Forgeryscope embeddings and native synthetic references locally.

Weights stay external. Uses the installed native runtime, no download/training.
Writes only .build/forgeryscope in this worktree. An export is not qualification.
"""
from pathlib import Path
import argparse, gc, hashlib, json, os, sys
import numpy as np
import torch

parser = argparse.ArgumentParser()
parser.add_argument('--native-root', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--models', nargs='+', default=['wblot_duplicate_embedder', 'wblot_overlap_embedder', 'wblot_lane_embedder', 'micro_overlap_embedder'])
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = root / '.build/forgeryscope'; out.mkdir(parents=True, exist_ok=True)
sys.path[:0] = [str(args.native_root / 'source'), str(args.native_root / 'integration/clone_detectors')]
# Local-only cache; all required files must exist and pass the pinned inventory.
from gui.sherloq_app.core.clone_models import verified, WEIGHTS
from sherloq_clone_models.forgeryscope.embedder.torch import Embedder
from sherloq_clone_models.forgeryscope.model_zoo import MODEL_SPECS
import onnx
import timm

torch.set_num_threads(2)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
class Network(torch.nn.Module):
    def __init__(self, embedder):
        super().__init__()
        self.backbone = embedder.backbone
        self.custom_pool = embedder.custom_pool
        self.pooling_type = embedder.pooling_type
    def forward(self, x):
        if self.pooling_type == 'none':
            x = self.backbone.forward_features(x).flatten(2).mean(-1)
        elif self.custom_pool is not None:
            x = self.custom_pool(self.backbone.forward_features(x))
        else:
            x = self.backbone(x)
        return torch.nn.functional.normalize(x, p=2, dim=1)

records = []
for name in args.models:
    spec = MODEL_SPECS[name]
    weight, weight_sha = verified(WEIGHTS / '02_forgeryscope' / spec['filename'])
    embedder = Embedder(str(weight), device='cpu', width=spec['width'], height=spec['height'], transform_type=spec['transform_type'])
    model = Network(embedder).eval()
    path = out / (name + '.onnx')
    sample = torch.zeros(1, 3, spec['height'], spec['width'])
    with torch.inference_mode():
        torch.onnx.export(model, (sample,), path, input_names=['rgb'], output_names=['embedding'], opset_version=18,
                          dynamo=False, external_data=False, dynamic_axes={'rgb': {0:'batch'}, 'embedding':{0:'batch'}})
    graph = onnx.load(path); onnx.checker.check_model(graph)
    cases = []
    for index, (h, w) in enumerate([(83, 197), (137, 51), (64, 320)]):
        y, x = np.mgrid[:h,:w]
        rgb = np.stack([(x*7+y*11)%256, (x*3+y*13)%256, (x*17+y*5)%256], axis=2).astype(np.uint8)
        inp = embedder.transform_image(rgb).cpu().contiguous()
        with torch.inference_mode():
            expected = embedder.get_embedding_batch([rgb]).cpu().numpy()
            wrapped = model(inp).cpu().numpy()
        assert np.array_equal(expected, wrapped), 'Export wrapper changed the native model'
        prefix = f'{name}-{index}'
        rgb.tofile(out / (prefix + '.rgb'))
        inp.numpy().astype('<f4').tofile(out / (prefix + '.f32'))
        cases.append(dict(id=prefix, width=w, height=h, rgbFile=prefix+'.rgb', inputFile=prefix+'.f32', inputShape=list(inp.shape),
                          embedding=expected.flatten().tolist()))
    config = timm.data.resolve_model_data_config(embedder.backbone)
    record = dict(id=name, checkpointSha256=weight_sha, file=path.name, bytes=path.stat().st_size, sha256=sha(path),
                  width=spec['width'], height=spec['height'], transform=spec['transform_type'], mean=config['mean'], std=config['std'],
                  pooling=embedder.pooling_type, cases=cases)
    records.append(record)
    (out / (name + '.json')).write_text(json.dumps(record, separators=(',',':'))+'\n')
    print(json.dumps(dict(model=name, bytes=record['bytes'], cases=len(cases))), flush=True)
    del graph, model, embedder; gc.collect()
report = dict(schema=1, torch=torch.__version__, numpy=np.__version__, onnx=onnx.__version__, timm=timm.__version__, models=records)
(out / 'embeddings-reference.json').write_text(json.dumps(report, separators=(',',':'))+'\n')
