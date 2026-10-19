#!/usr/bin/env python3
"""Rebuild native RITA operators from an existing matching source/checkpoint.

Requires Python3.11+, numpy, pillow, torch, torchvision, timm, onnx and
onnxruntime in the selected Python environment. No dependency, source or model
is downloaded. Original RITA remains credited to its authors; supplying this
converted model-weight resources retain CC-BY-NC-SA-4.0. No separate licence
grant for the original repository source is implied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SOURCE_SHA256 = '4ab0cb2a76ce537833589d12b54a4599322a5a5ba6a5277378d21c093c002c56'
CHECKPOINT_SHA256 = '50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299'
SOURCE_COMMIT = 'b50efcd5b4c41b8bfc69b0b10ce6230dcb67b983'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Original audited rita.py file.')
    parser.add_argument('--checkpoint', type=Path, required=True, help='Original rita_catnet.pth file.')
    parser.add_argument('--output', type=Path, required=True, help='Build directory; operator files go in segments/.')
    parser.add_argument('--qualify', action='store_true', help='Compare native Torch and split ONNX on fixed full-precision fixtures.')
    parser.add_argument('--verify-only', action='store_true', help='Verify an existing catalogue without running inference.')
    parser.add_argument('--image', type=Path, help='Additional native RGB test image; no resize is performed.')
    args = parser.parse_args()
    if sha(args.source) != SOURCE_SHA256:
        raise SystemExit('Source identity differs from audited RITA commit '+SOURCE_COMMIT)
    if sha(args.checkpoint) != CHECKPOINT_SHA256:
        raise SystemExit('Checkpoint identity differs from the supplied RITA CAT-Net-protocol checkpoint.')
    root = Path(__file__).resolve().parent
    manifest_path = args.output/'segments/manifest.json'
    common = ['--source', str(args.source.resolve()), '--checkpoint', str(args.checkpoint.resolve())]
    if not args.verify_only and not manifest_path.exists():
        subprocess.run([sys.executable, str(root/'rita-export-segments.py'), *common,
                        '--output', str((args.output/'segments').resolve())], check=True)
    manifest = json.loads(manifest_path.read_text())
    for name, asset in manifest['assets'].items():
        path = manifest_path.parent/asset['file']
        if path.stat().st_size != asset['bytes'] or sha(path) != asset['sha256']:
            raise SystemExit('Operator identity mismatch: '+name)
    if args.qualify and not args.verify_only:
        command = [sys.executable, str(root/'rita-qualify-segments.py'), *common,
                   '--directory', str(args.output.resolve())]
        subprocess.run(command, check=True)
        subprocess.run([*command, '--pattern-size', '769x513'], check=True)
        subprocess.run([sys.executable, str(root/'rita-qualify-row-windows.py'),
                        '--directory', str(args.output.resolve())], check=True)
        if args.image:
            subprocess.run([*command, '--image', str(args.image.resolve())], check=True)
    # This receipt contains portable identities only; source/checkpoint/image
    # paths and machine details are deliberately absent.
    receipt = {'schema':'sherloq.rita-native-reconstruction/1',
        'source_commit':SOURCE_COMMIT, 'source_sha256':SOURCE_SHA256,
        'checkpoint_sha256':CHECKPOINT_SHA256, 'manifest_sha256':sha(manifest_path),
        'graphs':len(manifest['assets']), 'model_bytes':sum(a['bytes'] for a in manifest['assets'].values()),
        'precision':'float32', 'native_geometry':'reflect padding to multiple32; exact crop, no resizing',
        'global_context':'complete native attention key/value banks retained for every query window',
        'qualification_requested':bool(args.qualify),
        'credit':{'authors':'Xuekang Zhu, Ji-Zhe Zhou, Kaiwen Feng, Chenfan Qu, Xiwen Wang, Yunfei Wang, Liting Zhou, Jian Liu',
                  'title':'Revisiting Image Manipulation Localization under Realistic Manipulation Scenarios',
                  'venue':'CVPR2026 Findings','paper':'https://arxiv.org/abs/2509.20006',
                  'repository':'https://github.com/scu-zjz/RITA'},
        'weights_license':{'spdx':'CC-BY-NC-SA-4.0','url':'https://creativecommons.org/licenses/by-nc-sa/4.0/'},
        'rights':'Converted model-weight operators retain CC-BY-NC-SA-4.0. Original source and checkpoint are supplied separately; no separate source-code licence grant is implied.'}
    if not args.verify_only:
        (args.output/'reconstruction.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
