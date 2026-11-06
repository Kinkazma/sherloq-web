"""Extract TruFor channel 333 with its fixed one-channel readout.

Requires the original TruFor source/config and original checkpoint.
Run with --help for explicit input/output paths. Does not modify the model.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageOps
import torch
from torch.nn import functional as F

EXPECTED_SHA256 = '2845912ff57f33502abea6a2075eecacd093a553825515691598c04ca5e94c12'
COEFFICIENT = 2.834346325108858
BIAS = -4.3996579849141835


def extract(model, rgb, device='cpu'):
    """Return low-resolution activation, native readout and native TruFor map."""
    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError('Expected an H x W x 3 uint8 RGB image')
    model = model.to(device=device, dtype=torch.float32).eval().requires_grad_(False)
    x = torch.from_numpy(rgb.transpose(2, 0, 1).copy())[None]
    x = x.to(device=device, dtype=torch.float32) / 256.0
    parts = []

    def capture(_module, _inputs, output):
        if output.ndim != 4 or output.shape[1] != 512:
            raise ValueError('Expected B x 512 x h x w post-ReLU features')
        parts.append(output[:, 333:334, :, :].detach().clone())

    handle = model.decode_head.linear_fuse.register_forward_hook(capture)
    try:
        with torch.inference_mode():
            out, _confidence, _detection, _noiseprint = model(x)
            if not parts:
                raise RuntimeError('The localization fusion hook was not called')
            # The optimized decoder may call the fusion block once per row band.
            activation = torch.cat(parts, dim=2)
            activation_native = F.interpolate(
                activation, size=rgb.shape[:2], mode='bilinear', align_corners=False
            )
            response = torch.sigmoid(COEFFICIENT * activation_native + BIAS)
            original = torch.softmax(out, dim=1)[:, 1:2]
            arrays = tuple(t[0, 0].float().cpu().numpy().copy()
                           for t in (activation, response, original))
    finally:
        handle.remove()
    if arrays[1].shape != rgb.shape[:2] or arrays[2].shape != rgb.shape[:2]:
        raise ValueError('Output does not match the native image dimensions')
    if not all(np.isfinite(a).all() for a in arrays):
        raise ValueError('Nonfinite output')
    return arrays


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src', type=Path, required=True,
                        help='TruFor src directory containing config.py and models/')
    parser.add_argument('--config', type=Path, required=True, help='Original trufor.yaml')
    parser.add_argument('--weights', type=Path, required=True, help='Original study checkpoint')
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New output .npz file')
    parser.add_argument('--device', choices=['cpu', 'cuda', 'mps'], default='cpu')
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Choose a new output path')
    if args.output.suffix != '.npz':
        raise ValueError('--output must end in .npz')
    with args.weights.open('rb') as stream:
        sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    if sha != EXPECTED_SHA256:
        raise ValueError('Checkpoint SHA256 differs from the original study model')
    sys.path.insert(0, str(args.src.resolve()))
    from config import _C
    from models.cmx.builder_np_conf import myEncoderDecoder
    cfg = _C.clone()
    cfg.merge_from_file(str(args.config.resolve()))
    cfg.MODEL.PRETRAINED = ''
    cfg.freeze()
    model = myEncoderDecoder(cfg=cfg)
    checkpoint = torch.load(args.weights, map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['state_dict'], strict=True)
    del checkpoint
    with Image.open(args.image) as image:
        rgb = np.asarray(ImageOps.exif_transpose(image).convert('RGB')).copy()
    activation, response, original = extract(model, rgb, args.device)
    meta = dict(weights_sha256=sha, normalization='RGB uint8 / 256',
                native_shape=list(rgb.shape[:2]), channel=333,
                module='decode_head.linear_fuse', capture='post-ReLU',
                interpolation='bilinear, align_corners=False, before sigmoid',
                coefficient=COEFFICIENT, bias=BIAS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('xb') as stream:
        np.savez_compressed(stream, activation333=activation, response333=response,
                            trufor_localization=original, metadata=json.dumps(meta))
    print(json.dumps({'output': str(args.output), 'shape': list(response.shape)}))


if __name__ == '__main__':
    main()
