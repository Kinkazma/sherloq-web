"""Offline, pinned SelfDM initial-map conversion (not Proposal SuperGlue).

Uses the released one-channel checkpoint and the actual proposals_coco.py
defaults: BGR/OpenCV float64 linear resize, channel means, 512 pixels, sigmoid.
The only mathematical rewrite is selecting the sorted 48 largest correlation
values with TopK instead of sorting and discarding the other 4048 values.
The reference path retains the upstream full sort with a device-only fix.
"""
import argparse
import collections
import hashlib
import importlib
import json
import pathlib
import sys
import time

import cv2
import numpy as np
import onnx
import onnxruntime as ort
import torch


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


parser = argparse.ArgumentParser()
parser.add_argument('--source', type=pathlib.Path, required=True)
parser.add_argument('--out', type=pathlib.Path, required=True)
parser.add_argument('--image', type=pathlib.Path, action='append', default=[])
parser.add_argument('--threads', type=int, default=4)
args = parser.parse_args()
source = args.source.resolve()
out = args.out.resolve()
out.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(source))
SADM = importlib.import_module('SADM')
torch.set_num_threads(args.threads)
torch.manual_seed(0)
checkpoint = source / 'selfdm.pth'
original = torch.load(checkpoint, map_location='cpu', weights_only=True)
assert all(key.startswith('module.') for key in original)
state = collections.OrderedDict((key[7:], value) for key, value in original.items())
assert tuple(state['classifier.last_conv.6.weight'].shape) == (1, 48, 1, 1)
native = SADM.SelfDM_VGG(1, 48).eval()
native.load_state_dict(state, strict=True)


class DeviceSort(torch.nn.Module):
    def forward(self, corr):
        values = torch.sort(corr, 1, descending=True).values
        return torch.index_select(values, 1, torch.arange(48, device=corr.device))


class ExactTopK(torch.nn.Module):
    def forward(self, corr):
        return torch.topk(corr, 48, dim=1, largest=True, sorted=True).values


class ProbabilityMap(torch.nn.Module):
    def __init__(self, network):
        super().__init__()
        self.network = network

    def forward(self, rgb):
        # The public input name is historical. Tensor contents are mean-centred
        # BGR as in utilsdm.imreadtonumpy, without scale or channel normalization.
        return self.network(rgb).sigmoid()


native.poolopt_on_corrmat = DeviceSort()
wrapper = ProbabilityMap(native).eval()
images = args.image
if not images:
    raise ValueError('At least one real validation image is required')
records = []


def save(name, array):
    array = np.ascontiguousarray(array)
    path = out / (name + '.bin')
    path.write_bytes(array.tobytes())
    return dict(file=path.name, shape=list(array.shape), dtype=str(array.dtype),
                bytes=path.stat().st_size, sha256=digest(path))


def prepare(image):
    bgr = cv2.imread(str(image), cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError('Cannot decode validation image: ' + str(image))
    resized = cv2.resize(bgr.astype(float), (512, 512))
    resized -= np.array([104.008, 116.669, 122.675])
    return bgr[:, :, ::-1].copy(), np.ascontiguousarray(resized.transpose(2, 0, 1)[None], dtype=np.float32)


with torch.inference_mode():
    for index, image in enumerate(images):
        rgb, input_array = prepare(image)
        tensor = torch.from_numpy(input_array)
        native.poolopt_on_corrmat = DeviceSort()
        started = time.monotonic()
        reference = wrapper(tensor).numpy()
        native_ms = (time.monotonic() - started) * 1000
        native.poolopt_on_corrmat = ExactTopK()
        started = time.monotonic()
        selected = wrapper(tensor).numpy()
        topk_ms = (time.monotonic() - started) * 1000
        assert np.array_equal(selected, reference), 'TopK must preserve native values exactly'
        name = 'reference-' + str(index)
        records.append(dict(name=name, source=dict(path=str(image.resolve()), sha256=digest(image)),
                            rgb=save(name + '-rgb', rgb), input=save(name + '-input', input_array),
                            probability=save(name + '-probability', reference),
                            mask=save(name + '-mask', (reference > 0.5).astype(np.uint8)),
                            nativeMs=native_ms, topkMs=topk_ms, topkExact=True,
                            min=float(reference.min()), max=float(reference.max()),
                            foreground=int(np.count_nonzero(reference > 0.5))))
        print(json.dumps({key: records[-1][key] for key in ['name', 'nativeMs', 'topkMs', 'min', 'max', 'foreground']}), flush=True)
    model_path = out / 'selfdm-map-512.onnx'
    torch.onnx.export(wrapper, tensor, model_path, input_names=['rgb'], output_names=['probability'],
                      opset_version=18, dynamo=False, external_data=False,
                      do_constant_folding=False)

model = onnx.load(model_path)
onnx.checker.check_model(model, full_check=True)
options = ort.SessionOptions()
options.intra_op_num_threads = args.threads
options.inter_op_num_threads = 1
options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
options.enable_cpu_mem_arena = False
options.enable_mem_pattern = False
session = ort.InferenceSession(str(model_path), sess_options=options, providers=['CPUExecutionProvider'])
for record in records:
    def read(spec):
        return np.frombuffer((out / spec['file']).read_bytes(), dtype=spec['dtype']).reshape(spec['shape'])
    reference = read(record['probability'])
    started = time.monotonic()
    actual = session.run(['probability'], {'rgb': read(record['input'])})[0]
    elapsed = (time.monotonic() - started) * 1000
    assert actual.shape == (1, 1, 512, 512) and np.isfinite(actual).all()
    maximum = float(np.max(np.abs(actual - reference)))
    changed = int(np.count_nonzero((actual > 0.5) != (reference > 0.5)))
    assert maximum <= 1e-3 and changed == 0, (maximum, changed)
    record['onnx'] = dict(maxAbs=maximum, maskChanged=changed, elapsedMs=elapsed,
                          probability=save(record['name'] + '-onnx-probability', actual))
report = dict(schema=1, status='native-and-ort-cpu-qualified-browser-pending',
              name='SelfDM — carte initiale (expérimental)', family='selfdm', side=512, kind='sigmoid',
              scope='Initial SelfDM VGG map only; DeepMask, Proposal SuperGlue and CRF are not included',
              sourceCommit='ef7b4a00d0c5742a63b187d898979259c2aead40', sources={name: digest(source / name) for name in ['SADM.py', 'attention_blocks.py', 'utilsdm.py', 'proposals_coco.py']},
              checkpoint=dict(file=str(checkpoint), bytes=checkpoint.stat().st_size, sha256=digest(checkpoint)),
              model=dict(file=model_path.name, bytes=model_path.stat().st_size, sha256=digest(model_path)),
              input=dict(name='rgb', layout='NCHW', color='BGR', resize='OpenCV INTER_LINEAR on float64 before Float32 conversion',
                         means=[104.008, 116.669, 122.675], divisor=1),
              output=dict(name='probability', shape=[1, 1, 512, 512], activation='sigmoid', mask='probability > 0.5'),
              rewrite='Exact sorted TopK(48,dim=1) replaces full correlation sort followed by indices 0..47; native exact reference retained',
              operators=dict(collections.Counter(node.op_type for node in model.graph.node)),
              torch=torch.__version__, onnx=onnx.__version__, onnxruntime=ort.__version__, opencv=cv2.__version__,
              threads=args.threads, probabilityTolerance=1e-3, allowedMaskChanges=0,
              scriptSha256=digest(pathlib.Path(__file__)), records=records)
(out / 'reference.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(model=report['model'], status=report['status'])), flush=True)
