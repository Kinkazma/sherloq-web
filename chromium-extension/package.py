#!/usr/bin/env python3
"""Assemble the extension offline with Python 3.10+, without npm or a Store account."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent


def inventory():
    result = {}
    for path in sorted((ROOT / 'extension').rglob('*')):
        if path.is_symlink():
            raise ValueError('Symbolic link refused: ' + path.name)
        if not path.is_file():
            continue
        name = path.relative_to(ROOT / 'extension').as_posix()
        if any(part.startswith('.') for part in path.relative_to(ROOT / 'extension').parts):
            raise ValueError('Hidden file refused: ' + name)
        data = path.read_bytes()
        if re.search(rb'/Users/[A-Za-z0-9_-]+/|/home/[A-Za-z0-9_-]+/|/mnt/(?:user|cache)/', data):
            raise ValueError('Private build path in ' + name)
        if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}', data):
            raise ValueError('Credential pattern in ' + name)
        if path.suffix.lower() in ('.onnx', '.zip', '.crx', '.pem'):
            raise ValueError('Unexpected payload: ' + name)
        result[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--check', action='store_true', help='Verify sources without writing a package')
    parser.add_argument('--update-inventory', action='store_true', help='Record an intentional source change')
    parser.add_argument('--zip-only', action='store_true', help='Do not keep an additional unpacked copy')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'extension/manifest.json').read_text())
    actual = inventory()
    spec = {'schema': 'sherloq.extension-source/1', 'version': manifest['version'], 'files': actual}
    index = ROOT / 'source-manifest.json'
    if args.update_inventory:
        index.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + '\n')
    if not index.is_file() or json.loads(index.read_text()) != spec:
        raise ValueError('Sources differ from source-manifest.json; inspect changes before updating the inventory')
    if args.check:
        print(json.dumps({'verified': len(actual), 'version': manifest['version']}))
        return
    output = args.output.resolve()
    # Do not overwrite a checkout or another extension while preparing output.
    if output == ROOT or output == ROOT / 'extension' or ROOT.is_relative_to(output):
        raise ValueError('Choose a separate output directory')
    output.mkdir(parents=True, exist_ok=True)
    unpacked = output / 'unpacked'
    if not args.zip_only and unpacked.exists():
        existing = {p.relative_to(unpacked).as_posix() for p in unpacked.rglob('*') if p.is_file()}
        if existing != set(actual) or any(p.is_symlink() for p in unpacked.rglob('*')):
            raise ValueError('Output has unrelated files; choose a fresh output directory')
    if not args.zip_only:
        shutil.copytree(ROOT / 'extension', unpacked, dirs_exist_ok=True)
    name = 'sherloq-loupe-' + manifest['version'] + '.zip'
    with tempfile.TemporaryDirectory(dir=output) as temporary:
        archive = Path(temporary) / name
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
            for relative in actual:
                info = zipfile.ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                package.writestr(info, (ROOT / 'extension' / relative).read_bytes(), compresslevel=9)
        target = output / name
        archive.replace(target)
    report = {'version': manifest['version'], 'files': len(actual),
              'unpackedBytes': sum(v['bytes'] for v in actual.values()),
              'zipBytes': target.stat().st_size,
              'zipSha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    (output / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
