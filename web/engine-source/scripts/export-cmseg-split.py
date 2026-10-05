"""Read-only native CMSeg references and independent encoder/decoder conversions.

Never exports the quadratic correlation as a giant constant or tensor. This
split is not an accepted browser engine until bounded correlation and final
decisions pass. Original checkpoints/runtime are verified by the native loader.
"""
from pathlib import Path
import argparse, hashlib, json, sys, time
import numpy as np
import torch
import torch.utils.model_zoo
import onnx
from PIL import Image
from torchvision import transforms as T

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('variant', choices=['generalization', 'addnoise'])
parser.add_argument('--append-positive', action='store_true', help='Extend an existing split reference with the generated positive fixture only')
args = parser.parse_args()
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
def denied(*args, **kwargs):
    raise RuntimeError('Offline conversion prohibits downloads')
torch.hub.download_url_to_file = denied
torch.utils.model_zoo.load_url = denied
torch.set_num_threads(8)
loaded = load_segmentation('CMSeg-Net ' + args.variant, 'cpu')
model = loaded['model']
out = root / '.build/segmentation-models' / ('cmseg-' + args.variant)
out.mkdir(parents=True, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
def save(name, value):
    if isinstance(value, torch.Tensor): value = value.detach().cpu().numpy()
    value = np.ascontiguousarray(value); data = value.tobytes(); filename = name + '.bin'
    (out / filename).write_bytes(data)
    return dict(file=filename, shape=list(value.shape), dtype=str(value.dtype), bytes=len(data), sha256=sha(data))

class Encoder(torch.nn.Module):
    def __init__(self):
        super().__init__(); self.network = model
    def forward(self, rgb):
        m = self.network; x = rgb
        for n in range(0, 2): x = m.encoder.features[n](x)
        x1 = m.sam1(m.aspp4(x))
        for n in range(2, 4): x = m.encoder.features[n](x)
        x2 = x
        for n in range(4, 7): x = m.encoder.features[n](x)
        x3 = x
        for n in range(7, 14): x = m.encoder.features[n](x)
        x4 = x
        for n in range(14, 19): x = m.encoder.features[n](x)
        return x1, x2, x3, x4, x

class Decoder(torch.nn.Module):
    def __init__(self):
        super().__init__(); self.network = model
    def forward(self, x1, c2, c3, c4, x5):
        m = self.network
        x2 = m.sam2(m.aspp3(c2)); x3 = m.sam3(m.aspp2(c3)); x4 = m.sam4(m.aspp1(c4))
        up1 = m.invres1(torch.cat([x4, m.dconv1(x5)], dim=1))
        up2 = m.invres2(torch.cat([x3, m.dconv2(up1)], dim=1))
        up3 = m.invres3(torch.cat([x2, m.dconv3(up2)], dim=1))
        up4 = m.invres4(torch.cat([m.trans(x1), m.dconv4(up3)], dim=1))
        logits = m.conv_score(m.conv_last(up4))
        return logits, logits.sigmoid()

encoder, decoder = Encoder().eval(), Decoder().eval()
fixture_root = root / '.build/segmentation-models/mgcfdn-mpdn'
fixtures = json.loads((fixture_root / 'reference.json').read_text())['records']
positive_path = root / '.build/cmseg-coverage/blobs-192.png'
previous = json.loads((out / 'split-reference.json').read_text()) if args.append_positive else None
if args.append_positive:
    assert positive_path.is_file() and not any(r['name'] == 'blobs-copy' for r in previous['records'])
    fixtures = []
if positive_path.is_file(): fixtures.append(dict(name='blobs-copy', generatedPositive=positive_path))
captured, hooks = {}, []
for name in ['corr24', 'corr32', 'corr96']:
    def capture(module, inputs, output, name=name):
        captured[name] = (inputs[0].clone(), output.clone())
    hooks.append(getattr(model, name).register_forward_hook(capture))
records = previous['records'][:] if previous else []
with torch.inference_mode():
    for row in fixtures:
        if 'generatedPositive' in row:
            rgb = np.asarray(Image.open(row['generatedPositive']).convert('RGB'))
        else:
            spec = row['rgb']; data = (fixture_root / spec['file']).read_bytes(); assert sha(data) == spec['sha256']
            rgb = np.frombuffer(data, np.uint8).reshape(spec['shape']).copy()
        tensor = T.Compose([T.Resize((512, 512)), T.ToTensor()])(Image.fromarray(rgb))[None]
        started = time.monotonic(); logits = model(tensor); probability = logits.sigmoid()
        elapsed = time.monotonic() - started
        features = encoder(tensor)
        for index, name in enumerate(['corr24', 'corr32', 'corr96'], 1):
            assert torch.equal(features[index], captured[name][0]), name
        arguments = (features[0], *(captured[name][1] for name in ['corr24', 'corr32', 'corr96']), features[4])
        split_logits, split_probability = decoder(*arguments)
        assert torch.equal(logits, split_logits) and torch.equal(probability, split_probability)
        name = row['name']
        record = dict(name=name, rgb=save(name + '-rgb', rgb), input=save(name + '-input', tensor),
                      logits=save(name + '-logits', logits), probability=save(name + '-probability', probability),
                      features=[save(name + '-feature-' + str(i), value) for i, value in enumerate(features)],
                      correlations=[save(name + '-' + key, captured[key][1]) for key in ['corr24', 'corr32', 'corr96']],
                      mask=save(name + '-mask', (probability > .5).to(torch.uint8)), nativeSeconds=elapsed,
                      nativeForeground=int((probability > .5).sum()), nativeSplitExact=True)
        records.append(record); print(name, 'native split exact', record['nativeForeground'], flush=True)
    for hook in hooks: hook.remove()
    # Drop the quadratic native window cache before exporting independent CNNs.
    for name in ['corr24', 'corr32', 'corr96']: getattr(model, name).zero_window.store.clear()
    graphs = previous['graphs'] if previous else {}
    for name, network, inputs, names, outputs in [
        ('encoder', encoder, tensor, ['rgb'], ['x1', 'x2', 'x3', 'x4', 'x5']),
        ('decoder', decoder, arguments, ['x1', 'c2', 'c3', 'c4', 'x5'], ['logits', 'probability'])]:
        target = out / (name + '.onnx')
        if previous:
            assert sha(target.read_bytes()) == graphs[name]['sha256']
            continue
        torch.onnx.export(network, inputs, target, input_names=names, output_names=outputs, opset_version=18, dynamo=False, external_data=False, do_constant_folding=False)
        graph = onnx.load(target)
        def strip(message):
            if hasattr(message, 'doc_string'): message.doc_string = ''
            for field, value in message.ListFields():
                if field.type == field.TYPE_MESSAGE:
                    for child in value if field.label == field.LABEL_REPEATED else [value]: strip(child)
        strip(graph); onnx.checker.check_model(graph); onnx.save(graph, target)
        data = target.read_bytes(); assert b'/Users/' not in data
        graphs[name] = dict(file=target.name, bytes=len(data), sha256=sha(data))
report = dict(schema=1, status='native-split-exact-browser-unqualified', variant='cmseg-' + args.variant,
              weights=loaded['weights'], graphs=graphs, side=512, kind='sigmoid', records=records,
              correlation=[dict(name=name, topk=getattr(model, name).topk, alpha=float(getattr(model, name).alpha.detach())) for name in ['corr24', 'corr32', 'corr96']],
              torch=torch.__version__, onnx=onnx.__version__, referenceThreads=8,
              scriptSha256=sha(Path(__file__).read_bytes()))
(out / 'split-reference.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ['status', 'variant', 'weights', 'graphs', 'correlation']}), flush=True)
