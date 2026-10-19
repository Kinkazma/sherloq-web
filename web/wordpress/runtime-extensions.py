"""Verify the additive browser-method layer against its immutable predecessor."""
from pathlib import Path, PurePosixPath
from copy import deepcopy
import hashlib
import json
import re

METHODS = ['bfree', 'spai', 'doctamper', 'comprint']
CORE_FILES = {'package.json', 'src/display-sampling.js', 'src/extensions-adapter.js',
              'src/extensions-export.js', 'src/extensions-plane-cache.js', 'src/extensions-result-surfaces.js',
              'src/index.d.ts', 'src/index.js', 'src/pixel-operations.js', 'src/neural-graph-pool.js', 'src/numeric-surface.js',
              'src/raster-export.js', 'src/worker-client.js', 'src/worker.js'}
encode = lambda value: (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
digest = lambda data: hashlib.sha256(data).hexdigest()


def reviewed_extensions_increment(root, latest_predecessor=None):
    root = Path(root)
    repository = root.parents[1]
    path = root / 'runtime-patches/browser-extensions-20261015.json'
    if not path.exists():
        return None, {}
    receipt = json.loads(path.read_bytes())
    if receipt.get('schema') != 'sherloq.browser-extensions-runtime-increment/1' or receipt.get('methods') != METHODS:
        raise ValueError('Unsupported independent browser-method increment')

    def read(name):
        if not isinstance(name, str) or '\\' in name or PurePosixPath(name).is_absolute() or any(part in ['', '.', '..'] for part in name.split('/')):
            raise ValueError('Unsafe browser-method metadata path')
        return latest_predecessor[name] if latest_predecessor and name in latest_predecessor else (repository / name).read_bytes()

    def verify(record, location=None):
        data = read(location or record['file'])
        if digest(data) != record['sha256'] or len(data) != record['size']:
            raise ValueError('Browser-method metadata identity differs: ' + record['file'])
        return data

    baseline = receipt['baseline']
    parent = baseline['parentReceipt']
    if parent['file'] != 'web/wordpress/runtime-patches/ela-runtime-20261014.json' or parent['sha256'] != 'b2e46e895640736b7a4120b7e32e242ba20e518a5888b14997cfd3c539c100f4':
        raise ValueError('Browser methods must retain the reviewed ELA predecessor')
    parent_receipt = json.loads(verify(parent))
    previous = {}
    for record in baseline['snapshots']:
        if record['file'] in previous or not record['copy'].startswith('web/wordpress/runtime-patches/baselines/web-0.20.0-extensions/'):
            raise ValueError('Invalid browser-method predecessor snapshot')
        previous[record['file']] = verify(record, record['copy'])

    def predecessor(record):
        data = previous[record['file']]
        if digest(data) != record['sha256'] or len(data) != record['size']:
            raise ValueError('Browser-method predecessor reference differs')
        return json.loads(data)

    before_manifest = predecessor(baseline['manifest'])
    if baseline['manifest']['file'] != parent_receipt['manifest']['file'] or baseline['manifest']['sha256'] != parent_receipt['manifest']['sha256']:
        raise ValueError('Browser-method predecessor inventory differs from ELA')
    locks = {}
    for kind in ['source', 'delivered']:
        record = baseline['locks'][kind]
        if record['file'] != parent_receipt['locks'][kind]['file'] or record['sha256'] != parent_receipt['locks'][kind]['sha256']:
            raise ValueError('Browser-method predecessor lock differs from ELA')
        locks[kind] = predecessor(record)
        if any(slot['destination'].endswith('/extension-engine') for slot in locks[kind]['runtimes']):
            raise ValueError('The browser-method slot already exists in its predecessor')
        locks[kind]['runtimes'].append({'destination': 'sherloq-browser/assets/extension-engine', 'version': '0.1.0-research', 'files': {}})
    records = receipt['files'] + receipt['resources']
    names = [record['file'] for record in records]
    if len(names) != len(set(names)) or {name.removeprefix('unified-engine/') for name in names if name.startswith('unified-engine/')} != CORE_FILES:
        raise ValueError('Browser-method core file set differs')
    after_manifest = json.loads(verify(receipt['manifest']))
    runtime_names = {record['file'] for record in receipt['files']}
    expected = deepcopy(before_manifest)
    expected['slots'].append('extension-engine')
    for record in records:
        name, after = record['file'], record['after']
        if not name.startswith(('unified-engine/', 'extension-engine/')) or any(part in ['', '.', '..'] for part in name.split('/')) or '\\' in name:
            raise ValueError('Unsafe browser-method resource path')
        slot_name, relative = name.split('/', 1)
        if (record['asset'], record['mirror']) != ('web/wordpress/sherloq-browser/assets/' + name, 'web/runtime-sources/' + name):
            raise ValueError('Browser-method source location differs')
        before = before_manifest['files'].get(name)
        if record['before'] != before or record['added'] != (before is None) or after.get('localOnly'):
            raise ValueError('Browser-method predecessor file descriptor differs: ' + name)
        if not isinstance(after['size'], int) or after['size'] < 1 or not re.fullmatch('[0-9a-f]{64}', after['sha256']) or not after['chunks']:
            raise ValueError('Invalid browser-method descriptor')
        for identity in after['chunks']:
            if not re.fullmatch('[0-9a-f]{64}', identity):
                raise ValueError('Invalid browser-method chunk identity')
            size = after_manifest['chunks'].get(identity)
            if not isinstance(size, int) or not 0 < size <= 100_000_000:
                raise ValueError('Invalid browser-method chunk size')
            if identity in expected['chunks'] and expected['chunks'][identity] != size:
                raise ValueError('Browser-method chunk redefinition')
            expected['chunks'][identity] = size
        if sum(expected['chunks'][identity] for identity in after['chunks']) != after['size']:
            raise ValueError('Browser-method resource pieces differ from its size')
        expected['files'][name] = after
        for kind in ['source', 'delivered']:
            slot = next(item for item in locks[kind]['runtimes'] if item['destination'] == 'sherloq-browser/assets/' + slot_name)
            if slot['files'].get(relative) != record['sourceBeforeSha256' if kind == 'source' else 'deliveredBeforeSha256']:
                raise ValueError('Browser-method prior lock differs: ' + name)
            slot['files'][relative] = record['sourceAfter']['sha256'] if kind == 'source' else after['sha256']
        if record['source']:
            source_name = ('web/engine-source/' if slot_name == 'unified-engine' else 'web/extensions-source/') + relative
            if record['source'] != source_name:
                raise ValueError('Browser-method canonical source location differs')
            raw = read(source_name)
            if digest(raw) != record['sourceAfter']['sha256'] or len(raw) != record['sourceAfter']['size']:
                raise ValueError('Browser-method canonical source identity differs')
        if name in runtime_names:
            data = read(record['asset'])
            if digest(data) != after['sha256'] or len(data) != after['size'] or read(record['mirror']) != data:
                raise ValueError('Browser-method delivered source identity differs')
            logic = re.sub(rb'^import [^\n]*runtime-context\.js\?v=[^\n]*;\n', b'', data)
            if slot_name == 'extension-engine' and Path(name).suffix in ('.js', '.mjs'):
                logic = logic.replace(b'unified-engine/', b'engine-source/')
            if logic != raw:
                raise ValueError('Browser-method transport adaptation differs')
    added_local = receipt['manifest']['addedLocalFiles']
    if len(added_local) != len(set(added_local)) or any(name in before_manifest['localFiles'] or name not in names for name in added_local):
        raise ValueError('Invalid browser-method local file additions')
    expected['localFiles'] += added_local
    if encode(expected) != verify(receipt['manifest']):
        raise ValueError('Browser-method increment changes undeclared dependency metadata')
    for kind in ['source', 'delivered']:
        if encode(locks[kind]) != verify(receipt['locks'][kind]):
            raise ValueError('Browser-method increment changes undeclared runtime locks')
    model_manifest = json.loads(read('web/extensions-source/models/manifest.json'))
    declared_models = {'extension-engine/' + asset['url']: asset for asset in model_manifest['assets'].values()}
    if set(model_manifest['methods']) != set(METHODS) or len(declared_models) != 5:
        raise ValueError('Browser methods must retain their five declared model resources')
    for name, asset in declared_models.items():
        if expected['files'][name]['sha256'] != asset['sha256'] or expected['files'][name]['size'] != asset['bytes']:
            raise ValueError('Browser-method graph identity differs')
    return receipt, previous
