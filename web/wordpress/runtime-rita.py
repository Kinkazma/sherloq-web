"""Verify the additive RITA layer without changing historical receipt bytes."""
from pathlib import Path, PurePosixPath
from copy import deepcopy
import hashlib
import json
import re

CORE = {'gpu-buffer-ledger.js', 'm2-npz-stream.js', 'm2-worker-host.js',
        'neural-graph-pool.js', 'neural-graph-worker.js', 'neural-session-cache.js',
        'neural-tensor-store.js', 'npz.js', 'rita-analyzer.js', 'rita-cache-plan.js',
        'rita-query-plan.js', 'rita-render.js', 'rita-segmented-network.js', 'rita-source-tensors.js'}
encode = lambda value: (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
digest = lambda data: hashlib.sha256(data).hexdigest()


def reviewed_rita_increment(root, latest_predecessor=None):
    root = Path(root)
    repository = root.parents[1]
    if latest_predecessor is None and (root / 'runtime-patches/interactive-20261020.json').exists():
        import importlib.util
        spec = importlib.util.spec_from_file_location('interactive_predecessor', root / 'runtime-interactive.py')
        layer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(layer)
        _, latest_predecessor = layer.reviewed_interactive_increment(root)
    path = root / 'runtime-patches/rita-20261019.json'
    if not path.exists():
        return None, {}
    receipt = json.loads(path.read_bytes())
    if receipt.get('schema') != 'sherloq.rita-runtime-increment/1' or receipt.get('version') != '0.22.0':
        raise ValueError('Unsupported RITA runtime increment')

    def read(name):
        if not isinstance(name, str) or PurePosixPath(name).is_absolute() or '\\' in name or any(p in ['', '.', '..'] for p in name.split('/')):
            raise ValueError('Unsafe RITA source path')
        return latest_predecessor[name] if latest_predecessor and name in latest_predecessor else (repository / name).read_bytes()

    def verify(record, location=None):
        data = read(location or record['file'])
        if len(data) != record['size'] or digest(data) != record['sha256']:
            raise ValueError('RITA metadata identity differs: ' + record['file'])
        return data

    baseline = receipt['baseline']
    parent = baseline['parentReceipt']
    if parent['file'] != 'web/wordpress/runtime-patches/browser-extensions-20261015.json' or parent['sha256'] != 'a426c99923011e5a86f7e2d76d0c2f53616c6d7c5d227aab479d6b9043b74a6b':
        raise ValueError('RITA must retain its reviewed predecessor')
    parent_receipt = json.loads(verify(parent))
    previous = {}
    for record in baseline['snapshots']:
        if record['file'] in previous or not record['copy'].startswith('web/wordpress/runtime-patches/baselines/web-0.21.0-rita/'):
            raise ValueError('Invalid RITA predecessor snapshot')
        previous[record['file']] = verify(record, record['copy'])
    def predecessor(record):
        data = previous[record['file']]
        if len(data) != record['size'] or digest(data) != record['sha256']:
            raise ValueError('RITA predecessor identity differs')
        return json.loads(data)
    if baseline['manifest']['file'] != parent_receipt['manifest']['file'] or baseline['manifest']['sha256'] != parent_receipt['manifest']['sha256']:
        raise ValueError('RITA predecessor inventory differs')
    before_manifest = predecessor(baseline['manifest'])
    expected = deepcopy(before_manifest)
    locks = {}
    for kind in ['source', 'delivered']:
        reference = baseline['locks'][kind]
        if reference['file'] != parent_receipt['locks'][kind]['file'] or reference['sha256'] != parent_receipt['locks'][kind]['sha256']:
            raise ValueError('RITA predecessor lock differs')
        locks[kind] = predecessor(reference)
        if 'uiVersion' in locks[kind]:
            locks[kind]['uiVersion'] = receipt['version']
        if 'deliveryAdapter' in locks[kind]:
            locks[kind]['deliveryAdapter']['uiVersion'] = receipt['version']
    records = receipt['files']
    if len(records) != len(CORE) or {r['file'] for r in records} != {'unified-engine/src/' + name for name in CORE}:
        raise ValueError('RITA runtime source set differs')
    after_manifest = json.loads(verify(receipt['manifest']))
    for record in records:
        name, after = record['file'], record['after']
        relative = name.removeprefix('unified-engine/')
        if (record['source'], record['asset'], record['mirror']) != ('web/engine-source/' + relative, 'web/wordpress/sherloq-browser/assets/' + name, 'web/runtime-sources/' + name):
            raise ValueError('RITA runtime source location differs')
        raw = read(record['source'])
        data = read(record['asset'])
        if len(raw) != record['sourceAfter']['size'] or digest(raw) != record['sourceAfter']['sha256'] or len(data) != after['size'] or digest(data) != after['sha256'] or read(record['mirror']) != data:
            raise ValueError('RITA runtime source identity differs: ' + name)
        if re.sub(rb'^import [^\n]*runtime-context\.js\?v=[^\n]*;\n', b'', data) != raw:
            raise ValueError('RITA runtime transport differs')
        for kind in ['source', 'delivered']:
            slot = next(s for s in locks[kind]['runtimes'] if s['destination'] == 'sherloq-browser/assets/unified-engine')
            if slot['files'].get(relative) != record['sourceBeforeSha256' if kind == 'source' else 'deliveredBeforeSha256']:
                raise ValueError('RITA prior runtime lock differs')
            slot['files'][relative] = record['sourceAfter']['sha256'] if kind == 'source' else after['sha256']
        if record['before'] != before_manifest['files'].get(name) or record['added'] != (name not in before_manifest['files']):
            raise ValueError('RITA prior file descriptor differs')
        expected['files'][name] = after
    model_prefix = 'individual-assets/rita-native/'
    model_manifest_bytes = read('web/wordpress/feature-inputs/' + model_prefix + 'manifest.json')
    if digest(model_manifest_bytes) != '2b09b435b8f2678d5aff1822489b89eb3220f9fdc479000d93d0285b1d22e42b':
        raise ValueError('RITA operator inventory changed')
    model = json.loads(model_manifest_bytes)
    expected_models = {model_prefix + a['file']: (a['bytes'], a['sha256']) for a in model['assets'].values()}
    notice = read('web/wordpress/feature-inputs/' + model_prefix + 'NOTICE.txt')
    if digest(notice) != 'dc4fb8dffc6b383442e4b60144be96bcad144b527eb359bba51697fd15e72a0c':
        raise ValueError('RITA notice changed')
    expected_models[model_prefix + 'manifest.json'] = (len(model_manifest_bytes), digest(model_manifest_bytes))
    expected_models[model_prefix + 'NOTICE.txt'] = (len(notice), digest(notice))
    resources = receipt['resources']
    if len(expected_models) != 110 or len(resources) != 110 or {r['file'] for r in resources} != set(expected_models):
        raise ValueError('RITA resource set differs')
    for record in resources:
        name, after = record['file'], record['after']
        if name in before_manifest['files'] or (after['size'], after['sha256']) != expected_models[name] or after.get('localOnly'):
            raise ValueError('RITA model identity differs: ' + name)
        expected['files'][name] = after
        for lock in locks.values():
            slot = next(s for s in lock['runtimes'] if s['destination'] == 'sherloq-browser/assets/individual-assets')
            relative = name.removeprefix('individual-assets/')
            if relative in slot['files']:
                raise ValueError('RITA resource already exists in predecessor lock')
            slot['files'][relative] = after['sha256']
    for record in records + resources:
        after = record['after']
        if not re.fullmatch('[a-f0-9]{64}', after['sha256']) or not 0 < after['size'] <= 100_000_000 or after['chunks'] != [after['sha256']] or after_manifest['chunks'].get(after['sha256']) != after['size']:
            raise ValueError('Invalid RITA resource chunk')
        if after['sha256'] in expected['chunks'] and expected['chunks'][after['sha256']] != after['size']:
            raise ValueError('RITA chunk redefinition')
        expected['chunks'][after['sha256']] = after['size']
    added_local = [r['file'] for r in records if r['file'] not in before_manifest['localFiles']]
    if receipt['manifest']['addedLocalFiles'] != added_local:
        raise ValueError('RITA local source additions differ')
    expected['localFiles'] += added_local
    if encode(expected) != verify(receipt['manifest']):
        raise ValueError('RITA changes undeclared dependency metadata')
    for kind in locks:
        if encode(locks[kind]) != verify(receipt['locks'][kind]):
            raise ValueError('RITA changes undeclared runtime locks')
    return receipt, {**(latest_predecessor or {}), **previous}
