#!/usr/bin/env python3
"""Export the audited native-geometric RITA forward; never pickle arbitrary code.

One FP32 step takes ImageNet-normalized RGB, the previous categorical mask and
the integer iteration channel, shape [1,5,H,W]. H/W must be multiples of 32.
Padding/cropping, EOS termination and the official output-step selection stay
outside this graph so no ONNX exporter can freeze a data-dependent decision.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import types

CHECKPOINT_SHA256 = '50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299'
SOURCE_SHA256 = '4ab0cb2a76ce537833589d12b54a4599322a5a5ba6a5277378d21c093c002c56'
SOURCE_COMMIT = 'b50efcd5b4c41b8bfc69b0b10ce6230dcb67b983'


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def native_source(path):
    original = Path(path).read_text()
    old = "MixVisionTransformer('/mnt/data0/xuekang/workspace/convswin/mit_b3.pth')"
    assert original.count(old) == 1
    text = original.replace(old, 'MixVisionTransformer(None)')
    changes = [{'from': old, 'to': 'MixVisionTransformer(None)',
                'reason': 'Complete supplied checkpoint replaces preliminary backbone load.'}]
    for number in (128, 64, 32, 16):
        for old, new in [(f'gray_x = x[:,:,{number}:,:]', 'gray_x = x[:,:,H:,:]'),
                         (f'x = x[:,:,:{number},:]', 'x = x[:,:,:H,:]')]:
            assert text.count(old) == 1, old
            text = text.replace(old, new)
            changes.append({'from': old, 'to': new})
    old = '        iter_values = x[:, 4:, 0, 0].squeeze(1).long()'
    new = '        input_hw = x.shape[-2:]\n' + old
    assert text.count(old) == 1
    text = text.replace(old, new)
    old = '        pred_mask = self.resize(pred_mask)'
    new = '        pred_mask = nn.functional.interpolate(pred_mask, size=input_hw, mode="bilinear", align_corners=True)'
    assert text.count(old) == 1
    text = text.replace(old, new)
    changes.append({'from': old, 'to': new})
    module = types.ModuleType('rita_native_browser_export')
    module.__file__ = str(path)
    exec(compile(text, str(path), 'exec'), module.__dict__)
    return module, changes, hashlib.sha256(text.encode()).hexdigest()


def load_model(source, checkpoint, torch):
    assert digest(checkpoint) == CHECKPOINT_SHA256, 'Unexpected RITA checkpoint identity.'
    assert digest(source) == SOURCE_SHA256, 'Unexpected RITA source identity.'
    module, changes, adapted_sha = native_source(source)
    model = module.RITA(num_classes=4)
    state = torch.load(checkpoint, map_location='cpu', weights_only=True)
    own = model.state_dict()
    assert isinstance(state, dict) and len(state) == 631
    assert set(state) == set(own)
    assert all(isinstance(v, torch.Tensor) and v.shape == own[k].shape
               for k, v in state.items())
    result = model.load_state_dict(state, strict=True)
    assert not result.missing_keys and not result.unexpected_keys
    model = model.float().eval()
    del state
    return model, {'source_sha256': digest(source), 'source_commit': SOURCE_COMMIT, 'adapted_source_sha256': adapted_sha,
                   'checkpoint_sha256': CHECKPOINT_SHA256, 'state_keys': 631,
                   'parameters': sum(p.numel() for p in model.parameters()),
                   'source_changes': changes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=8)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    import numpy as np
    import torch
    import onnx
    import onnxruntime as ort
    torch.set_num_threads(args.threads)
    torch.manual_seed(42)
    np.random.seed(42)
    started = time.monotonic()
    model, audit = load_model(args.source, args.checkpoint, torch)
    if not args.validate_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.output.exists():
            raise FileExistsError('Refuse replacing an existing model; use --validate-only.')
        example = torch.zeros((1, 5, 64, 96), dtype=torch.float32)
        example[:, 3] = 3
        with torch.inference_mode():
            torch.onnx.export(model, example, str(args.output), input_names=['input'],
                output_names=['logits'], dynamic_axes={
                    'input': {2: 'height', 3: 'width'},
                    'logits': {2: 'height', 3: 'width'}},
                opset_version=17, do_constant_folding=True, dynamo=False,
                external_data=False)
    graph = onnx.load(args.output)
    onnx.checker.check_model(graph)
    audit.update(format='ONNX', opset=17, file=args.output.name,
        bytes=args.output.stat().st_size, sha256=digest(args.output),
        nodes=len(graph.graph.node), initializers=len(graph.graph.initializer),
        operations=sorted(set(n.op_type for n in graph.graph.node)),
        attention_blocks=sum(n.op_type == 'Softmax' for n in graph.graph.node),
        input={'name': 'input', 'dtype': 'float32', 'shape': [1, 5, 'H', 'W']},
        output={'name': 'logits', 'dtype': 'float32', 'shape': [1, 4, 'H', 'W']},
        inference='One exact native FP32 autoregressive step; no tiling, scaling or threshold baked in.',
        normalization={'mean': [.485, .456, .406], 'std': [.229, .224, .225]},
        padding='Reflect right/bottom to multiples of32, then crop all returned planes.',
        iterations={'initial_mask': 3, 'start': 0, 'maximum_steps': 10,
                    'stop': 'Every padded output pixel is class2 (EOS).'},
        validation=[])
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
    session = ort.InferenceSession(str(args.output), options,
                                   providers=['CPUExecutionProvider'])
    for h, w, step in ((64, 96, 0), (96, 64, 2), (320, 416, 0)):
        x = np.random.default_rng(42 + step).standard_normal((1, 5, h, w)).astype('float32')
        x[:, 3] = 3 if step == 0 else np.random.default_rng(43).integers(0, 4, (h, w))
        x[:, 4] = step
        start = time.monotonic()
        with torch.inference_mode():
            expected = model(torch.from_numpy(x)).numpy()
        torch_seconds = time.monotonic() - start
        start = time.monotonic()
        actual = session.run(['logits'], {'input': x})[0]
        row = {'size': [w, h], 'step': step, 'torch_seconds': torch_seconds,
               'onnx_seconds': time.monotonic() - start,
               'finite': bool(np.isfinite(actual).all()),
               'max_absolute_logit_error': float(np.abs(actual - expected).max()),
               'mean_absolute_logit_error': float(np.abs(actual - expected).mean()),
               'argmax_mismatches': int((actual.argmax(1) != expected.argmax(1)).sum())}
        audit['validation'].append(row)
        print(json.dumps(row), flush=True)
        assert row['finite'] and row['max_absolute_logit_error'] < 1e-3
    audit['seconds'] = time.monotonic() - started
    args.output.with_suffix('.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps({'complete': True, 'bytes': audit['bytes'], 'sha256': audit['sha256'],
                      'seconds': audit['seconds']}), flush=True)


if __name__ == '__main__':
    main()
