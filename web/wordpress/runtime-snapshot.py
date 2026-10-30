"""Validate the complete current runtime snapshot without replaying old layers.

Historical receipts retain their original meaning. The current snapshot pins
the canonical inputs, both locks and the complete resource catalogue separately.
No build derives new trusted identities from an unreviewed working directory.
"""
import hashlib
import json
import re
from pathlib import Path, PurePosixPath


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_companions(repository, manifest):
    """Check source-owned runtime companions independently of the inventory.

    Compiler sources and native oracle/build inputs are not browser resources.
    Browser modules, shader sources, model graphs and component notices are.
    A self-consistent lock cannot establish that those files were all included.
    """
    engine = repository / 'web/engine-source'
    runtime_suffixes = {'.js', '.mjs', '.json', '.wasm', '.wgsl', '.glsl',
                        '.vert', '.frag', '.onnx', '.bin', '.pack', '.icc',
                        '.data', '.mem', '.ts'}
    checked = 0
    for directory in ['src', 'vendor']:
        for path in sorted((engine / directory).rglob('*')):
            if not path.is_file():
                continue
            notice = (any(part in path.name.lower() for part in
                          ['license', 'notice', 'copyright']) or path.name == 'README.ijg')
            if path.suffix.lower() not in runtime_suffixes and not notice:
                continue
            name = 'unified-engine/' + path.relative_to(engine).as_posix()
            record = manifest['files'].get(name)
            if record is None:
                raise ValueError('Source-owned runtime companion missing: ' + name)
            # JS receives the reviewed transport wrapper. Other companions
            # must remain exactly the canonical source bytes.
            if path.suffix not in {'.js', '.mjs'}:
                data = path.read_bytes()
                if len(data) != record['size'] or digest(data) != record['sha256']:
                    raise ValueError('Runtime companion identity differs: ' + name)
            checked += 1
    # Content-addressed PDF bindings must resolve to that exact module, rather
    # than merely adding a revision query to a different PDF.js implementation.
    assets = repository / 'web/wordpress/sherloq-browser/assets'
    facade = assets / 'pdf-native-library.js'
    if facade.exists():
        bindings = re.findall(r"['\"]\./([^'\"]+\.mjs)(?:\?[^'\"]*)?['\"]", facade.read_text())
        for name in bindings:
            expected = re.search(r'(?<![a-f0-9])([a-f0-9]{64})(?![a-f0-9])', name)
            if expected and manifest['files'].get(name, {}).get('sha256') != expected[1]:
                raise ValueError('Native PDF display binding differs: ' + name)
        # Refuse the former query-only binding even when its old target exists.
        for name, identity in re.findall(r"['\"]\./([^'\"?]+)\?sherloq-display=1-([a-f0-9]{64})['\"]", facade.read_text()):
            if manifest['files'].get(name, {}).get('sha256') != identity:
                raise ValueError('Native PDF display binding differs: ' + name)
    return checked


class RuntimeSnapshot:
    snapshot = True

    def __init__(self, root):
        root = Path(root)
        repository = root.parents[1]
        receipt = json.loads((root / 'runtime-patches/current-snapshot.json').read_bytes())
        if receipt.get('schema') != 'sherloq.runtime-snapshot/1':
            raise ValueError('Unsupported complete runtime snapshot')

        def read(record):
            name = record['file']
            parts = PurePosixPath(name)
            if parts.is_absolute() or any(p in ('', '.', '..') for p in name.split('/')) or '\\' in name:
                raise ValueError('Unsafe runtime snapshot input')
            data = (repository / name).read_bytes()
            if len(data) != record['bytes'] or digest(data) != record['sha256']:
                raise ValueError('Runtime snapshot input differs: ' + name)
            return data

        manifest = json.loads(read(receipt['manifest']))
        for record in receipt['locks'].values():
            read(record)
        for record in receipt['canonicalFiles']:
            read(record)
        if manifest.get('schema') != 'sherloq.dependencies/1' or manifest.get('remoteBase') is not None:
            raise ValueError('A source snapshot must have an unconfigured resource origin')
        if any(sum(manifest['chunks'][h] for h in item['chunks']) != item['size']
               for item in manifest['files'].values()):
            raise ValueError('Runtime snapshot resource extents differ')
        referenced = {h for item in manifest['files'].values() for h in item['chunks']}
        if set(manifest['chunks']) != referenced:
            raise ValueError('Current runtime snapshot contains unreferenced chunks')
        self.companions_checked = validate_companions(repository, manifest)
        self.files = {name: {'file': name, 'after': record}
                      for name, record in manifest['files'].items()}
        self.extra_resources = {}
        self.receipts = []
        self.predecessor = {}
        self.receipt = receipt

    def apply(self, relative, source, adapted):
        record = self.files.get(relative)
        if record is None:
            raise ValueError('Unreviewed runtime snapshot resource: ' + relative)
        expected = record['after']
        if len(source) != expected['size'] or digest(source) != expected['sha256']:
            raise ValueError('Runtime snapshot delivery differs: ' + relative)
        # restore-dependencies materializes the reviewed delivered bytes. Keep
        # them exact rather than adding a second transport wrapper.
        return source
