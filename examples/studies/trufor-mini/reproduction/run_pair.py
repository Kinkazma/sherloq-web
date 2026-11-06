#!/usr/bin/env python3
"""Run the frozen original-TruFor / TruFor-Mini pair on native corpus images.

CPU FP32 only. Input pixels, image scores, mask conventions and thresholds
match the study. This does not retrain, calibrate, resize or re-encode images.
The output directory must be new. No existing result is overwritten or deleted.

Python >=3.11; inference dependencies: torch, numpy, Pillow, timm and yacs.
Use --help without installing inference dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
ORIGINAL_SHA256 = '2845912ff57f33502abea6a2075eecacd093a553825515691598c04ca5e94c12'
MINI_REFERENCE_SHA256 = 'bd9fd0221c17e8c2e3fa518f2945178a660349c55b333a9680c15e7676fe1dc3'


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def json_file(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')


def tensor_fingerprint(state):
    """Content identity, independent of the checkpoint container serialization."""
    import torch
    h = hashlib.sha256()
    for key in sorted(state):
        value = state[key].detach().cpu().contiguous()
        h.update(key.encode('utf-8') + b'\0')
        h.update(str(value.dtype).encode('ascii') + b'\0')
        h.update(json.dumps(list(value.shape), separators=(',', ':')).encode('ascii') + b'\0')
        h.update(value.reshape(-1).view(torch.uint8).numpy().tobytes())
    return h.hexdigest()


def read_models(original_path, mini_path, threads):
    import functools
    import torch
    from torch import nn
    sys.path.insert(0, str(HERE/'trufor_src'))
    import compact
    from config import _C
    from models.cmx.builder_np_conf import myEncoderDecoder

    torch.set_num_threads(threads)
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError:
        pass
    spec_path = HERE/'reconstruction/mini-spec.json'
    spec = json.loads(spec_path.read_text()) if spec_path.is_file() else None
    original_hash = digest(original_path)
    original_bundle = torch.load(original_path, map_location='cpu', weights_only=True)
    original_state = original_bundle['state_dict']
    original_state_hash = tensor_fingerprint(original_state)
    if original_hash != ORIGINAL_SHA256:
        if spec is None or original_state_hash != spec['original_state_sha256']:
            raise ValueError('Original checkpoint identity does not match the study')
    if spec is not None and original_state_hash != spec['original_state_sha256']:
        raise ValueError('Original tensor fingerprint differs from the reconstruction specification')
    cfg = _C.clone()
    cfg.merge_from_file(str(HERE/'trufor_src/trufor.yaml'))
    cfg.MODEL.PRETRAINED = ''
    cfg.freeze()
    original = myEncoderDecoder(cfg=cfg)
    original.load_state_dict(original_state, strict=True)
    original = original.float().eval().requires_grad_(False)
    del original_bundle, original_state

    mini_hash = digest(mini_path)
    bundle = torch.load(mini_path, map_location='cpu', weights_only=True)
    mini_state_hash = tensor_fingerprint(bundle['state'])
    if spec is not None:
        if mini_state_hash != spec['mini_state_sha256']:
            raise ValueError('Mini tensor fingerprint differs from the study')
        if bundle['config'] != spec['config'] or bundle.get('selection', {}) != spec['selection']:
            raise ValueError('Mini architecture or channel selection differs from the study')
    elif mini_hash != MINI_REFERENCE_SHA256:
        raise ValueError('Mini requires either the reference checkpoint or its reconstruction specification')
    mini = compact.CompactTruFor(bundle['config'])
    selection = bundle.get('selection', {})
    for branch in ['rgb', 'noise']:
        for stage, blocks in enumerate(getattr(mini, branch+'_blocks'), 1):
            for index, block in zip(mini.config[branch][stage-1], blocks):
                key = f'{branch}.{stage}.{index}.mlp'
                if key not in selection:
                    continue
                width = len(selection[key])
                channels = block.mlp.fc1.in_features
                dtype = block.mlp.fc1.weight.dtype
                block.mlp.fc1 = nn.Linear(channels, width).to(dtype=dtype)
                block.mlp.dwconv.dwconv = nn.Conv2d(width, width, 3, padding=1, groups=width).to(dtype=dtype)
                block.mlp.fc2 = nn.Linear(width, channels).to(dtype=dtype)
    previous = 3
    convolution = 0
    for index, layer in enumerate(mini.noise):
        if not isinstance(layer, nn.Conv2d):
            continue
        width = len(selection.get(f'npp.{convolution}', range(layer.out_channels)))
        mini.noise[index] = nn.Conv2d(previous, width, 3, padding=1, bias=True).to(dtype=layer.weight.dtype)
        previous = width
        convolution += 1
    mini.load_state_dict(bundle['state'], strict=True)
    policy = bundle['config'].get('runtime_policy', {})
    if policy:
        compact.bounded_sdpa = functools.partial(
            compact.bounded_sdpa, budget=policy['budget_bytes'], max_queries=policy['max_queries']
        )
    mini = mini.float().eval().requires_grad_(False)
    del bundle
    identity = dict(original_checkpoint_sha256=original_hash,
                    original_state_sha256=original_state_hash,
                    mini_checkpoint_sha256=mini_hash, mini_state_sha256=mini_state_hash,
                    mini_specification_sha256=digest(spec_path) if spec is not None else None)
    return original, mini, identity


def run_models(original, mini, rgb):
    import numpy as np
    import torch
    from torch.nn import functional as F
    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError('Native uint8 RGB input required')
    x = torch.from_numpy(rgb.transpose(2, 0, 1).copy()).float()[None]/256
    with torch.inference_mode():
        start = time.monotonic()
        out, confidence, detection, noiseprint = original(x)
        full = torch.softmax(out[0], 0)[1].numpy().copy()
        official = float(torch.sigmoid(detection).item())
        full_seconds = time.monotonic()-start
        del out, confidence, detection, noiseprint
        start = time.monotonic()
        units = mini.units(mini.features(x))
        logits = (units*mini.read8).sum(1, keepdim=True)+mini.read8_bias
        reduced = torch.sigmoid(F.interpolate(
            logits, size=rgb.shape[:2], mode='bilinear', align_corners=False
        ))[0, 0].numpy().copy()
        mini_seconds = time.monotonic()-start
    if not all(np.isfinite(a).all() for a in [full, reduced]) or not np.isfinite(official):
        raise ValueError('Nonfinite model response')
    return full, reduced, official, dict(trufor_original=full_seconds, proxy_current=mini_seconds)


def input_path(data_root, relative):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Manifest image and mask paths must be relative to --data-root')
    return data_root/path


def save_npz(path, arrays):
    import numpy as np
    with path.open('xb') as stream:
        np.savez_compressed(stream, **arrays)
    return digest(path)


def calculate(original, mini, case, data_root, output, save_maps, save_histograms):
    import numpy as np
    from measures import native_rgb, labels, histograms, pixel_views, at_threshold, image_scores, agreement, THRESHOLDS
    identifier = case['id']
    dataset = case['dataset']
    if any(not re.fullmatch(r'[A-Za-z0-9_.-]+', value) or value in ['.', '..'] for value in [identifier, dataset]):
        raise ValueError('Unsafe case identifier or dataset label')
    image_path = input_path(data_root, case['path'])
    if digest(image_path) != case['sha256']:
        raise ValueError('Source image checksum mismatch')
    if case.get('mask') and digest(input_path(data_root, case['mask'])) != case['mask_sha256']:
        raise ValueError('Source mask checksum mismatch')
    rgb = native_rgb(image_path)  # Encoded pixel grid: intentionally no EXIF transpose.
    if list(rgb.shape[:2]) != case['shape']:
        raise ValueError('Native image dimensions differ from the manifest')
    lab, kind, annotation_status = labels(case, data_root)
    full, reduced, official, seconds = run_models(original, mini, rgb)
    record = dict(id=identifier, dataset=dataset, status='ok', is_tampered=case['is_tampered'],
                  image_sha256=case['sha256'], shape=case['shape'], completed_at=now(),
                  inference_seconds=seconds, annotation_status=annotation_status, label_protocol=kind,
                  image_scores={'trufor_original': image_scores(full), 'proxy_current': image_scores(reduced)},
                  pixel_metrics={}, direct_agreement=agreement(full, reduced))
    record['image_scores']['trufor_original']['official_global_score'] = official
    hists = {}
    if lab is not None:
        for model, response in [('trufor_original', full), ('proxy_current', reduced)]:
            hist = histograms(response, lab)
            hists[model] = hist
            record['pixel_metrics'][model] = {
                view: {str(t): at_threshold(positive, negative, t) for t in THRESHOLDS}
                for view, (positive, negative) in pixel_views(hist, kind).items()
            }
        record['valid_annotation_pixels'] = int(np.sum(lab != 255))
    if save_maps or save_histograms:
        folder = output/dataset
        folder.mkdir(exist_ok=True)
    if save_histograms:
        path = folder/(identifier+'.hist.npz')
        record['hist_file'] = str(path.relative_to(output))
        record['hist_sha256'] = save_npz(path, hists)
    if save_maps:
        arrays = dict(trufor_original=full, proxy_current=reduced)
        if lab is not None:
            arrays['groundtruth_labels'] = lab
        elif case.get('mask'):
            from PIL import Image
            with Image.open(input_path(data_root, case['mask'])) as image:
                arrays['unmatched_original_annotation'] = np.asarray(image).copy()
        path = folder/(identifier+'.maps.npz')
        record['maps_file'] = str(path.relative_to(output))
        record['maps_sha256'] = save_npz(path, arrays)
    return record


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--original-weights', type=Path, required=True)
    p.add_argument('--mini-weights', type=Path, required=True)
    p.add_argument('--data-root', type=Path, required=True, help='Root directory for the corpus-relative paths in the manifest')
    p.add_argument('--manifest', type=Path, default=HERE/'cases.json')
    p.add_argument('--output', type=Path, required=True, help='New directory for results.jsonl and run metadata')
    p.add_argument('--threads', type=int, default=1, help='CPU intra-operation threads; default: 1')
    selected = p.add_mutually_exclusive_group()
    selected.add_argument('--limit', type=int, help='Run only the first N manifest entries')
    selected.add_argument('--ids', help='Comma-separated case IDs, preserving manifest order')
    p.add_argument('--save-maps', action='store_true', help='Also retain both native float32 maps, annotations and histograms')
    p.add_argument('--save-histograms', action='store_true', help='Retain class histograms without the larger maps')
    return p


def main():
    p = parser()
    args = p.parse_args()
    if args.threads < 1:
        p.error('--threads must be positive')
    if args.limit is not None and args.limit < 1:
        p.error('--limit must be positive')
    if args.output.exists():
        p.error('--output must be a new directory; existing results are never overwritten')
    manifest = json.loads(args.manifest.read_text())
    cases = manifest['cases'] if isinstance(manifest, dict) else manifest
    if len({c['id'] for c in cases}) != len(cases):
        raise ValueError('Duplicate case IDs in manifest')
    if args.ids:
        selected = set(args.ids.split(','))
        missing = selected-{c['id'] for c in cases}
        if missing:
            p.error('Unknown case IDs: '+', '.join(sorted(missing)))
        cases = [c for c in cases if c['id'] in selected]
    if args.limit is not None:
        cases = cases[:args.limit]
    if not cases:
        p.error('No selected cases')
    original, mini, identity = read_models(args.original_weights, args.mini_weights, args.threads)
    import torch
    import numpy as np
    args.output.mkdir(parents=True, exist_ok=False)
    metadata = dict(started_at=now(), manifest_sha256=digest(args.manifest), selected_cases=len(cases),
                    backend='pytorch_cpu_fp32', python=sys.version.split()[0], torch=torch.__version__, numpy=np.__version__,
                    threads=torch.get_num_threads(), interop_threads=torch.get_num_interop_threads(),
                    normalization='Native encoded RGB uint8 /256; no EXIF transpose, resizing or recompression',
                    thresholds=[0.0, 0.5, 0.75], decision='response >= threshold',
                    timing='One forward per model, original before Mini, including map retrieval; excludes weights and disk I/O',
                    save_maps=args.save_maps, save_histograms=args.save_histograms or args.save_maps, **identity)
    json_file(args.output/'run-config.json', metadata)
    completed = 0
    started = time.monotonic()
    try:
        with (args.output/'results.jsonl').open('x', encoding='utf-8') as stream:
            for case in cases:
                record = calculate(original, mini, case, args.data_root, args.output,
                                   args.save_maps, args.save_histograms or args.save_maps)
                stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False)+'\n')
                stream.flush()
                completed += 1
                print(f'Completed {completed}/{len(cases)}: {case["id"]}', flush=True)
    except Exception as exc:
        json_file(args.output/'run-summary.json', dict(status='failed', completed_cases=completed,
                  total_cases=len(cases), elapsed_seconds=time.monotonic()-started, completed_at=now(), error=str(exc)))
        raise
    json_file(args.output/'run-summary.json', dict(status='complete', completed_cases=completed,
              total_cases=len(cases), elapsed_seconds=time.monotonic()-started, completed_at=now()))


if __name__ == '__main__':
    main()
