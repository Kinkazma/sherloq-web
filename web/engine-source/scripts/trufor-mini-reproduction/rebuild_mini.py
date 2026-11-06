#!/usr/bin/env python3
"""Reconstruct the frozen Mini tensor state from original TruFor weights.

This reconstruction uses exact source-tensor casts plus a small archive of
derived tensors. It performs no inference, fitting or platform-dependent
matrix factorization. Python >=3.11, NumPy and PyTorch are required.

    python rebuild_mini.py --original-weights original.pt --output mini.pt

The output serialization can differ from the study checkpoint. Every named
tensor is verified using a canonical fingerprint before the output is saved.
"""
from __future__ import annotations
import argparse
from collections import OrderedDict
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
SPEC_PATH = HERE / 'reconstruction' / 'mini-spec.json'
DTYPES = {name: getattr(torch, name) for name in
          ('float16', 'float32', 'float64', 'int64', 'int32', 'int16', 'int8', 'uint8', 'bool')}


def file_sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def state_fingerprint(state):
    """Canonical SHA256 independent of torch.save container metadata.

    In sorted key order, hash: name UTF-8 + NUL, dtype ASCII + NUL,
    shape as compact JSON + NUL, then contiguous CPU tensor bytes.
    This format is recorded as tensor-state-sha256-v1 in mini-spec.json.
    """
    digest = hashlib.sha256()
    for name in sorted(state):
        value = state[name].detach().cpu().contiguous()
        digest.update(name.encode('utf-8') + b'\0')
        digest.update(str(value.dtype).encode('ascii') + b'\0')
        digest.update(json.dumps(list(value.shape), separators=(',', ':')).encode('ascii') + b'\0')
        digest.update(value.reshape(-1).view(torch.uint8).numpy().tobytes())
    return digest.hexdigest()


def load_spec():
    return json.loads(SPEC_PATH.read_text())


def load_original_state(path, spec=None):
    spec = load_spec() if spec is None else spec
    checkpoint = torch.load(path, map_location='cpu', weights_only=True)
    if not isinstance(checkpoint, dict) or 'state_dict' not in checkpoint:
        raise ValueError('Expected original TruFor checkpoint with state_dict')
    state = checkpoint['state_dict']
    if state_fingerprint(state) != spec['original_state_sha256']:
        raise ValueError('Original TruFor tensor fingerprint differs from the study model')
    return state


def rebuild_state(original_state, spec=None):
    spec = load_spec() if spec is None else spec
    artifact = SPEC_PATH.parent / spec['derived_tensors_file']
    if file_sha256(artifact) != spec['derived_tensors_sha256']:
        raise ValueError('Derived-tensor archive checksum mismatch')
    state = OrderedDict()
    with np.load(artifact, allow_pickle=False) as values:
        for name, recipe in sorted(spec['tensor_recipes'].items()):
            if 'source' in recipe:
                value = original_state[recipe['source']]
                for dtype in recipe['casts']:
                    value = value.to(dtype=DTYPES[dtype])
                state[name] = value.detach().cpu().clone().contiguous()
            else:
                state[name] = torch.from_numpy(values[recipe['derived']].copy())
    if len(state) != spec['mini_state_tensors']:
        raise ValueError('Unexpected Mini tensor count')
    if state_fingerprint(state) != spec['mini_state_sha256']:
        raise ValueError('Reconstructed Mini tensor fingerprint differs from the study model')
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original-weights', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Choose a new output path; existing files are not overwritten')
    torch.set_num_threads(1)
    spec = load_spec()
    original = load_original_state(args.original_weights, spec)
    state = rebuild_state(original, spec)
    bundle = {'config': spec['config'], 'selection': spec['selection'], 'state': state,
              'metadata': {'tensor_fingerprint_format': spec['fingerprint_format'],
                           'tensor_sha256': spec['mini_state_sha256'],
                           'original_tensor_sha256': spec['original_state_sha256']}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('xb') as stream:
        torch.save(bundle, stream)
    print(json.dumps({'output': str(args.output), 'tensors': len(state),
                      'tensor_sha256': spec['mini_state_sha256']}))


if __name__ == '__main__':
    main()
