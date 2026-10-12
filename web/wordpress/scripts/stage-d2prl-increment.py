#!/usr/bin/env python3
"""Stage the retained D2PRL increment into existing, content-addressed delivery.

Only catalogued D2PRL resources and the two shared adapter inputs are eligible.
Unrelated delivery entries and all model chunks are preserved. No network I/O.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def stage(repo, manifest_path):
    engine = repo / 'web/engine-source'
    wordpress = repo / 'web/wordpress'
    assets = wordpress / 'sherloq-browser/assets'
    manifest = json.loads(manifest_path.read_bytes())
    if manifest.get('schema') != 'sherloq.dependencies/1':
        raise ValueError('Existing dependency manifest required')
    source_lock = json.loads((wordpress / 'runtime-source-lock.json').read_bytes())
    delivered_lock = json.loads((wordpress / 'runtime-lock.json').read_bytes())
    slot = 'sherloq-browser/assets/unified-engine'
    source_slot = next(r for r in source_lock['runtimes'] if r['destination'] == slot)
    delivered_slot = next(r for r in delivered_lock['runtimes'] if r['destination'] == slot)
    spec = importlib.util.spec_from_file_location('delivery', wordpress / 'runtime-delivery.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    version = delivered_lock['deliveryAdapter']['uiVersion']
    catalog = json.loads((engine / 'runtime-manifest.json').read_bytes())
    eligible = [r for r in catalog['files'] if r['file'].startswith(('experiments/d2prl/', 'vendor/d2prl/'))
                or r['file'] in ('src/d2prl-adapter.js', 'src/d2prl-runtime.js', 'src/migration-workspace.js')]
    eligible.append({'file': 'runtime-manifest.json', 'sha256': digest((engine / 'runtime-manifest.json').read_bytes()),
                     'bytes': (engine / 'runtime-manifest.json').stat().st_size})
    prepared = []
    for record in eligible:
        name = record['file']
        if '..' in Path(name).parts or Path(name).is_absolute():
            raise ValueError('Unsafe catalog path')
        original = (engine / name).read_bytes()
        if len(original) != record['bytes'] or digest(original) != record['sha256']:
            raise ValueError('Stale source catalog: ' + name)
        if source_slot['files'].get(name) == record['sha256']:
            continue
        relative = 'unified-engine/' + name
        def lookup(path):
            logical = path.removeprefix('unified-engine/')
            if path == logical or '..' in Path(logical).parts:
                raise ValueError('Unexpected transport dependency')
            return (engine / logical).read_bytes()
        delivered = adapter.adapted_runtime(relative, original, lookup, version)
        # Native bytes are identical; only generated transport/module context changes.
        if name.endswith('.wasm') and delivered != original:
            raise ValueError('Native binary modified by delivery')
        prepared.append((name, relative, original, delivered))
    proof_file = wordpress / 'd2prl-delivery-increment.json'
    previous = json.loads(proof_file.read_bytes()) if proof_file.exists() else {'files': []}
    changes_by_name = {r['file']: r for r in previous['files']}
    for name, relative, original, delivered in prepared:
        sha = digest(delivered)
        chunk = repo / 'web-assets/chunks' / (sha + '.bin')
        chunk.parent.mkdir(parents=True, exist_ok=True)
        if chunk.exists():
            if chunk.read_bytes() != delivered:
                raise ValueError('Existing immutable chunk differs: ' + sha)
        else:
            chunk.write_bytes(delivered)
        for target in (assets / relative, repo / 'web/runtime-sources' / relative):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(delivered)
        source_slot['files'][name] = digest(original)
        delivered_slot['files'][name] = sha
        manifest['files'][relative] = {'sha256': sha, 'size': len(delivered), 'type':
            'text/javascript' if name.endswith(('.js', '.mjs')) else
            'application/wasm' if name.endswith('.wasm') else 'application/json' if name.endswith('.json') else 'application/octet-stream',
            'chunks': [sha]}
        manifest['chunks'][sha] = len(delivered)
        if relative not in manifest['localFiles']:
            manifest['localFiles'].append(relative)
        changes_by_name[relative] = {'file': relative, 'sourceSha256': digest(original), 'sha256': sha, 'bytes': len(delivered)}
    changes = [changes_by_name[name] for name in sorted(changes_by_name)]
    proof = {'schema': 'sherloq.d2prl-delivery-increment/1', 'status': 'staged-and-hash-verified',
             'uiVersion': version, 'scope': 'Retained D2PRL resources only; existing unrelated slots, models and chunks preserved.',
             'sourceRuntimeManifestSha256': digest((engine / 'runtime-manifest.json').read_bytes()), 'files': changes}
    increment_sha = digest(encode(proof))
    for lock_slot in (source_slot, delivered_slot):
        lock_slot['d2prlIncrement'] = {'kind': 'qualified-exact-runtime-overlay', 'sha256': increment_sha}
    for name, value in [('runtime-source-lock.json', source_lock), ('runtime-lock.json', delivered_lock)]:
        (wordpress / name).write_bytes(encode(value))
    manifest['localFiles'].sort()
    target = repo / 'web-assets/manifest-template.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encode(manifest))
    proof_file.write_bytes(encode(proof))
    (assets / 'd2prl-delivery-increment.json').write_bytes(encode(proof))
    config_path = assets / 'integrated-config.json'
    config = json.loads(config_path.read_bytes())
    config['d2prlRuntimeIncrementSha256'] = increment_sha
    config['d2prlRuntimeIncrementReceipt'] = './d2prl-delivery-increment.json'
    config_path.write_bytes(encode(config))
    for change in changes:
        value = (assets / change['file']).read_bytes()
        if digest(value) != change['sha256'] or value != (repo / 'web/runtime-sources' / change['file']).read_bytes():
            raise ValueError('Final installed mirror mismatch')
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--asset-manifest', type=Path, required=True)
    args = parser.parse_args()
    result = stage(args.repository.resolve(), args.asset_manifest.resolve())
    print(json.dumps({'status': result['status'], 'files': len(result['files']),
                      'bytes': sum(r['bytes'] for r in result['files'])}))
