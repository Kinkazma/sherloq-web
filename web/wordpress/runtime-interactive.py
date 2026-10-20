"""Verify the interactive-control layer against the published RITA delivery."""
from pathlib import Path, PurePosixPath
from copy import deepcopy
import hashlib
import json

CORE = frozenset({
    'src/cached-parameter-preview.js', 'src/ela-classic-preview.js', 'src/index.js',
    'src/m3-adapter.js', 'src/png-stream.js', 'src/retained-result.js',
    'src/safire-parameter-preview.js', 'src/safire.js', 'src/segmented-blocking.js',
    'src/worker-client.js', 'src/worker.js', 'vendor/png-stream/PINNED.json',
    'vendor/png-stream/png-stream.js', 'vendor/png-stream/png-stream.wasm',
})
PARENT = 'web/wordpress/runtime-patches/rita-20261019.json'
PARENT_SHA = 'fb2e6e61642c390ac557c971acd5efb924b4e4982e2fefc56db860ae702d763f'
PNG_SHA = '8630cb9c926c1c7b74c53a00e10237f5adfb4a00153597421130d0c961584590'
PREFIX = 'web/wordpress/runtime-patches/baselines/web-0.22.0-interactive/'
encode = lambda x: (json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
digest = lambda x: hashlib.sha256(x).hexdigest()


def reviewed_interactive_increment(root, latest_predecessor=None):
    root = Path(root)
    repository = root.parents[1]
    if latest_predecessor is None and (root / 'runtime-patches/workspace-20261020.json').exists():
        import importlib.util
        spec = importlib.util.spec_from_file_location('workspace_predecessor', root / 'runtime-workspace.py')
        layer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(layer)
        _, latest_predecessor = layer.reviewed_workspace_increment(root)
    path = root / 'runtime-patches/interactive-20261020.json'
    if not path.exists():
        return None, {}
    receipt = json.loads(path.read_bytes())
    if receipt.get('schema') != 'sherloq.interactive-runtime-increment/1' or receipt.get('version') != '0.23.0':
        raise ValueError('Unsupported interactive runtime increment')

    def read(name):
        if not isinstance(name, str) or PurePosixPath(name).is_absolute() or '\\' in name or any(p in ['', '.', '..'] for p in name.split('/')):
            raise ValueError('Unsafe interactive source path')
        return latest_predecessor[name] if latest_predecessor and name in latest_predecessor else (repository / name).read_bytes()

    def verify(ref, location=None):
        data = read(location or ref['file'])
        if digest(data) != ref['sha256'] or len(data) != ref['size']:
            raise ValueError('Interactive metadata identity differs: ' + ref['file'])
        return data

    baseline = receipt['baseline']
    parent = baseline['parentReceipt']
    if parent['file'] != PARENT or parent['sha256'] != PARENT_SHA:
        raise ValueError('Interactive predecessor differs')
    parent = json.loads(verify(parent))
    previous = {}
    for ref in baseline['snapshots']:
        if ref['file'] in previous or not ref['copy'].startswith(PREFIX):
            raise ValueError('Invalid interactive predecessor snapshot')
        previous[ref['file']] = verify(ref, ref['copy'])

    def predecessor(ref):
        data = previous[ref['file']]
        if digest(data) != ref['sha256'] or len(data) != ref['size']:
            raise ValueError('Interactive predecessor identity differs')
        return json.loads(data)

    if baseline['manifest']['file'] != parent['manifest']['file'] or baseline['manifest']['sha256'] != parent['manifest']['sha256']:
        raise ValueError('Interactive predecessor inventory differs')
    manifest = predecessor(baseline['manifest'])
    expected = deepcopy(manifest)
    locks = {}
    for kind in ['source', 'delivered']:
        ref = baseline['locks'][kind]
        if ref['file'] != parent['locks'][kind]['file'] or ref['sha256'] != parent['locks'][kind]['sha256']:
            raise ValueError('Interactive predecessor lock differs')
        locks[kind] = predecessor(ref)
        if 'uiVersion' in locks[kind]:
            locks[kind]['uiVersion'] = receipt['version']
        if 'deliveryAdapter' in locks[kind]:
            locks[kind]['deliveryAdapter']['uiVersion'] = receipt['version']
    records = receipt['files']
    if len(records) != len(CORE) or {r['file'] for r in records} != {'unified-engine/' + n for n in CORE}:
        raise ValueError('Interactive runtime source set differs')
    added_local = []
    for record in records:
        name = record['file']
        rel = name.removeprefix('unified-engine/')
        if (record['source'], record['asset'], record['mirror']) != ('web/engine-source/' + rel, 'web/wordpress/sherloq-browser/assets/' + name, 'web/runtime-sources/' + name):
            raise ValueError('Interactive runtime source location differs')
        raw, data = read(record['source']), read(record['asset'])
        after = record['after']
        if len(raw) != record['sourceAfter']['size'] or digest(raw) != record['sourceAfter']['sha256'] or len(data) != after['size'] or digest(data) != after['sha256'] or read(record['mirror']) != data:
            raise ValueError('Interactive runtime source identity differs: ' + name)
        if not 0 < len(data) < 512_000 or after['chunks'] != [after['sha256']]:
            raise ValueError('Invalid interactive resource descriptor')
        if rel.endswith('.wasm') and (digest(data) != PNG_SHA or data != raw):
            raise ValueError('Unreviewed interactive native binary')
        if rel.startswith('src/') and data != b'import "../../runtime-context.js?v=0.23.0";\n' + raw:
            raise ValueError('Interactive source transport differs')
        if record['before'] != manifest['files'].get(name) or record['added'] != (name not in manifest['files']):
            raise ValueError('Interactive predecessor descriptor differs')
        expected['files'][name] = after
        expected['chunks'][after['sha256']] = len(data)
        if name not in expected['localFiles']:
            expected['localFiles'].append(name)
            added_local.append(name)
        for kind in locks:
            slot = next(x for x in locks[kind]['runtimes'] if x['destination'] == 'sherloq-browser/assets/unified-engine')
            if slot['files'].get(rel) != record['sourceBeforeSha256' if kind == 'source' else 'deliveredBeforeSha256']:
                raise ValueError('Interactive predecessor runtime lock differs')
            slot['files'][rel] = record['sourceAfter']['sha256'] if kind == 'source' else after['sha256']
    native = receipt['nativeSource']
    if native['file'] != 'web/engine-source/native/png-stream.c':
        raise ValueError('Unexpected interactive native source')
    verify(native)
    if receipt['manifest']['addedLocalFiles'] != added_local or encode(expected) != verify(receipt['manifest']):
        raise ValueError('Interactive changes undeclared dependency metadata')
    for kind in locks:
        if receipt['locks'][kind]['file'] != baseline['locks'][kind]['file'] or encode(locks[kind]) != verify(receipt['locks'][kind]):
            raise ValueError('Interactive changes undeclared runtime locks')
    return receipt, {**(latest_predecessor or {}), **previous}
