#!/usr/bin/env python3
"""Assemble a reviewed working tree into a separate complete private source clone.

No Git selection, publication, deployment or calculation. Existing immutable
resources remain in their locked slots. Canonical browser companions receive
only the existing transport adapter before new locks/catalogues are recorded.
"""
import argparse
import hashlib
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

CHUNK = 100_000_000


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def active_bundle_name(path):
    return re.fullmatch(r'worker-bundle-[a-f0-9]+\.mjs', path.name) is not None


def record(repository, path):
    return {'file': path.relative_to(repository).as_posix(), 'bytes': path.stat().st_size, 'sha256': sha(path)}


def assemble(source, staging, receipt_path, *, node='node', full_verify=True, complete_chunks=False, ai_detectors_qualification_proof=None):
    source, staging = source.resolve(), staging.resolve()
    if source == staging or source.is_relative_to(staging) or staging.is_relative_to(source):
        raise ValueError('A distinct, previously cloned staging repository is required')
    swp, wp = source / 'web/wordpress', staging / 'web/wordpress'
    engine, staged_engine = source / 'web/engine-source', staging / 'web/engine-source'
    assets = wp / 'sherloq-browser/assets'
    if not (staging / 'web-assets/manifest-template.json').is_file():
        raise ValueError('Staging must already contain the complete private repository clone')
    inventory = load('local_runtime_inventory', swp / 'runtime-inventory.py')
    adapter = load('local_runtime_delivery', swp / 'runtime-delivery.py')
    detectors = load('local_ai_detector_assets', swp / 'runtime-ai-detectors.py')
    builder = load('local_build', swp / 'build.py')
    snapshot = json.loads((wp / 'runtime-patches/current-snapshot.json').read_text())
    baseline_manifest_bytes = (staging / 'web-assets/manifest-template.json').read_bytes()
    if digest(baseline_manifest_bytes) != snapshot['manifest']['sha256']:
        raise ValueError('Baseline manifest differs from its retained snapshot')
    manifest = json.loads(baseline_manifest_bytes)
    for name, spec in snapshot['locks'].items():
        if sha(staging / spec['file']) != spec['sha256']:
            raise ValueError('Baseline lock differs: ' + name)
    lock = json.loads((wp / 'runtime-lock.json').read_text())
    source_lock = json.loads((wp / 'runtime-source-lock.json').read_text())
    print(json.dumps({'phase': 'validating-baseline', 'fullHashes': full_verify}), flush=True)
    if full_verify:
        builder.locked_files(wp)  # complete physical file set and locked byte hashes
    else:
        for runtime in lock['runtimes']:
            root = wp / runtime['destination']
            actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name != '.DS_Store'}
            if actual != set(runtime['files']):
                raise ValueError('Baseline physical inventory differs: ' + runtime['destination'])
    print(json.dumps({'phase': 'baseline-valid'}), flush=True)
    active = inventory.selected_worker(engine)
    if not active:
        raise ValueError('This qualified local candidate requires its validated generated Worker')
    subprocess.run([node, str(engine / 'scripts/build-engine-worker.mjs'), '--engine-root=' + str(engine),
        '--ui-root=' + str(swp / 'sherloq-browser/assets'), '--output-root=' + str(engine), '--check'], check=True)
    active_name = Path(active['path']).name
    version = re.search(r'Version:\s*([\d.]+)', (swp / 'sherloq-browser/sherloq-browser.php').read_text())[1]
    slots = manifest['slots']
    root_sources, copied_root_source = set(), 0
    for name in ('README.md', 'CHANGELOG.md', 'LICENSE'):
        path, target = source / name, staging / name
        if path.is_file():
            root_sources.add(name)
            if not target.is_file() or sha(target) != sha(path):
                put(target, path.read_bytes())
                copied_root_source += 1
    # Keep the reconstructible engine project as well as its browser runtime.
    # Tests, native sources and build scripts are not runtime companions.
    engine_sources, copied_engine_source = set(), 0
    for path in sorted(engine.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(engine)
        if any(part.startswith('.') or part in {'node_modules', '__pycache__'} for part in rel.parts):
            continue
        if rel.parts[0] == 'src' and path.name.startswith('worker-bundle-') and path.suffix == '.mjs' and path.name != active_name:
            continue
        engine_sources.add(rel.as_posix())
        target = staged_engine / rel
        if not target.is_file() or sha(target) != sha(path):
            put(target, path.read_bytes())
            copied_engine_source += 1
    # Bring fresh source-owned scripts/UI to the clone; dependencies are updated
    # separately, only through the bounded inventory and transport adapter.
    copied_source = 0
    for path in sorted(swp.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(swp)
        if any(part.startswith('.') or part in {'node_modules', '__pycache__', 'dist'} for part in rel.parts):
            continue
        if rel.parts[:2] == ('sherloq-browser', 'assets') and len(rel.parts) > 2 and rel.parts[2] in slots:
            continue
        target = wp / rel
        if not target.exists() or sha(target) != sha(path):
            put(target, path.read_bytes())
            copied_source += 1
    runtime_paths = inventory.runtime_paths(engine)
    raw = {p.relative_to(engine).as_posix(): p for p in runtime_paths}
    # Canonical sources and packaging proof retain their raw identities. Old
    # artifacts are removed only in this new delivery; loaded personal tabs keep
    # their original checkout untouched.
    removed = []
    for root in (staged_engine / 'src', assets / 'unified-engine/src'):
        for old in root.glob('worker-bundle-*.mjs'):
            if old.name != active_name:
                removed.append(old.relative_to(staging).as_posix())
                old.unlink()
    for name, path in raw.items():
        target = staged_engine / name
        if not target.is_file() or sha(target) != sha(path):
            put(target, path.read_bytes())
    changed, new_chunks = [], set()
    slot = 'unified-engine'
    def lookup(relative):
        if relative.startswith(slot + '/') and relative[len(slot) + 1:] in raw:
            return raw[relative[len(slot) + 1:]].read_bytes()
        return (assets / relative).read_bytes()
    print(json.dumps({'phase': 'adapting-canonical-companions', 'files': len(raw)}), flush=True)
    raw_hashes = {}
    for name, path in raw.items():
        relative = slot + '/' + name
        original = path.read_bytes()
        raw_hashes[name] = digest(original)
        data = adapter.adapted_runtime(relative, original, lookup, version) if path.suffix in {'.js', '.mjs'} else original
        identity = digest(data)
        previous = manifest['files'].get(relative)
        if previous and previous['sha256'] == identity and previous['size'] == len(data):
            continue
        pieces = []
        for offset in range(0, len(data), CHUNK):
            piece = data[offset:offset + CHUNK]
            part = digest(piece)
            pieces.append(part)
            manifest['chunks'][part] = len(piece)
            chunk = staging / 'web-assets/chunks' / (part + '.bin')
            if not chunk.exists():
                put(chunk, piece)
                new_chunks.add(part)
            elif sha(chunk) != part:
                raise ValueError('Existing chunk is corrupt: ' + part)
        put(assets / relative, data)
        manifest['files'][relative] = {'sha256': identity, 'size': len(data),
            'type': {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json'}.get(path.suffix, mimetypes.guess_type(name)[0] or 'application/octet-stream'), 'chunks': pieces}
        changed.append({'file': relative, 'sourceSha256': raw_hashes[name], 'before': previous, 'after': manifest['files'][relative]})
    for relative in list(manifest['files']):
        path = Path(relative)
        if path.parts[:2] == ('unified-engine', 'src') and active_bundle_name(path) and path.name != active_name:
            manifest['files'].pop(relative)
    # Retained model bytes live once canonically outside the runtime engine;
    # assembly exposes the one URL family used by the common UI configuration.
    ai_detector_delivery = detectors.stage_detector_assets(source, staging, manifest, source_lock, lock,
        qualification_proof=ai_detectors_qualification_proof)
    changed.extend(ai_detector_delivery['changedFiles'])
    new_chunks.update(ai_detector_delivery['newChunks'])
    locals_set = set(manifest.get('localFiles', [])) & set(manifest['files'])
    for relative, spec in manifest['files'].items():
        path = Path(relative)
        if relative.startswith(slot + '/') and not spec.get('localOnly') and ((path.suffix in {'.js', '.mjs', '.json', '.wgsl', '.glsl', '.vert', '.frag'} and spec['size'] <= 128 * 1024) or (path.suffix == '.wasm' and spec['size'] < 300 * 1024)):
            locals_set.add(relative)
    manifest['localFiles'] = sorted(locals_set)
    referenced = {h for spec in manifest['files'].values() for h in spec['chunks']}
    manifest['chunks'] = {h: size for h, size in manifest['chunks'].items() if h in referenced}
    manifest['remoteBase'] = None
    # Both locks describe the same complete physical slots, with distinct raw
    # and transport identities for the canonical source replacements.
    for value, raw_source in ((source_lock, True), (lock, False)):
        for runtime in value['runtimes']:
            name = Path(runtime['destination']).name
            if name != slot:
                continue
            runtime['files'] = {p.relative_to(assets / slot).as_posix(): sha(p) for p in sorted((assets / slot).rglob('*')) if p.is_file() and p.name != '.DS_Store'}
            if raw_source:
                runtime['files'].update(raw_hashes)
            runtime.pop('engineCommit', None)
            runtime['version'] = json.loads((engine / 'package.json').read_text())['version']
            runtime['sourceIncrement'] = {'kind': 'reviewed-bounded-local-working-tree', 'sha256': digest(encode(raw_hashes))}
        value['uiVersion'] = version
        value['status'] = 'reviewed-private-local-candidate'
        value['localAssemblyVersion'] = version
    lock['deliveryAdapter'] = {'script': 'runtime-delivery.py', 'uiVersion': version, 'sourceLock': 'runtime-source-lock.json'}
    put(wp / 'runtime-source-lock.json', encode(source_lock))
    put(wp / 'runtime-lock.json', encode(lock))
    put(staging / 'web-assets/manifest-template.json', encode(manifest))
    put(assets / '__manifest.json', encode(manifest))
    put(assets / 'dependency-config.json', encode({'schema': 'sherloq.dependency-config/1', 'enabled': False,
        'offline': False, 'version': version, 'manifest': digest(encode(manifest)), 'workerType': 'module', 'workerVersion': Path(active_name).stem.removeprefix('worker-bundle-')}))
    features = load('local_features', swp / 'scripts/generate-feature-catalog.py')
    catalogue = features.generate(manifest, wp / 'feature-inputs', assets)
    put(assets / 'feature-catalog.json', encode(catalogue))
    offline = load('local_offline_shell', swp / 'offline-shell.py')
    shell = offline.write_shell(wp / 'sherloq-browser', manifest, digest(encode(manifest)), version)
    print(json.dumps({'phase': 'metadata-created', 'changedFiles': len(changed), 'features': len(catalogue['features']), 'shellFiles': len(shell['files'])}), flush=True)
    # Pin all prior canonical inputs that still exist, plus every new browser
    # companion and local UI/script source. No Git tracking is consulted.
    canonical = {row['file'] for row in snapshot['canonicalFiles'] if (staging / row['file']).is_file()}
    canonical.update('web/engine-source/' + name for name in raw)
    canonical.update('web/engine-source/' + name for name in engine_sources)
    canonical.update(root_sources)
    canonical.update(ai_detector_delivery['canonicalFiles'])
    for path in sorted(wp.rglob('*')):
        if not path.is_file() or path.suffix not in {'.py', '.js', '.mjs', '.html', '.css', '.json'}:
            continue
        rel = path.relative_to(wp)
        if any(part.startswith('.') or part in {'node_modules', '__pycache__', 'dist'} for part in rel.parts):
            continue
        if rel.parts[:2] == ('sherloq-browser', 'assets') and len(rel.parts) > 2:
            if rel.parts[2] in slots or rel.parts[2].startswith(('dependency-manifest-', 'offline/')) or rel.parts[2] in {'__manifest.json', 'dependency-config.json', 'offline-shell.json', 'feature-catalog.json', 'offline-public-app.html'}:
                continue
        if rel.as_posix() in {'runtime-lock.json', 'runtime-source-lock.json', 'runtime-patches/current-snapshot.json'}:
            continue
        canonical.add('web/wordpress/' + rel.as_posix())
    snapshot = {'schema': 'sherloq.runtime-snapshot/1', 'scope': 'Complete reviewed private local candidate; historical receipts preserved. Filesystem admission is explicit and bounded; no publication or native arithmetic change.',
        'uiVersion': version, 'worker': active, 'manifest': record(staging, staging / 'web-assets/manifest-template.json'),
        'locks': {name: record(staging, wp / name) for name in ('runtime-lock.json', 'runtime-source-lock.json')},
        'canonicalFiles': [record(staging, staging / name) for name in sorted(canonical)]}
    put(wp / 'runtime-patches/current-snapshot.json', encode(snapshot))
    materialized = 0
    if complete_chunks:
        print(json.dumps({'phase': 'materializing-complete-chunks', 'referencedChunks': len(manifest['chunks'])}), flush=True)
        for relative, spec in manifest['files'].items():
            if spec.get('localOnly'):
                continue
            path = assets / relative
            if not path.is_file() or path.stat().st_size != spec['size'] or sha(path) != spec['sha256']:
                raise ValueError('Cannot materialize chunk from unverified physical input: ' + relative)
            with path.open('rb') as stream:
                for identity in spec['chunks']:
                    target = staging / 'web-assets/chunks' / (identity + '.bin')
                    size = manifest['chunks'][identity]
                    if target.is_file() and target.stat().st_size == size and sha(target) == identity:
                        stream.seek(size, 1)
                        continue
                    if len(spec['chunks']) == 1 and identity == spec['sha256']:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.unlink(missing_ok=True)
                        os.link(path, target)
                    else:
                        data = stream.read(size)
                        if len(data) != size or digest(data) != identity:
                            raise ValueError('Physical chunk identity differs: ' + relative)
                        put(target, data)
                    materialized += 1
                    if materialized % 250 == 0:
                        print(json.dumps({'phase': 'materializing-complete-chunks', 'created': materialized}), flush=True)
    validated = load('staged_runtime_snapshot', wp / 'runtime-snapshot.py').RuntimeSnapshot(wp)
    result = {'schema': 'sherloq.private-local-assembly/1', 'sourceRoot': str(source), 'stagingRoot': str(staging),
        'baselineManifestSha256': digest(baseline_manifest_bytes), 'baselineVerification': 'full' if full_verify else 'inventory-only',
        'version': version, 'worker': active, 'removedInactiveWorkerArtifacts': removed, 'copiedSourceFiles': copied_source,
        'copiedEngineSourceFiles': copied_engine_source,
        'copiedRootSourceFiles': copied_root_source,
        'aiDetectors': {key: value for key, value in ai_detector_delivery.items() if key not in {'canonicalFiles', 'changedFiles', 'newChunks'}},
        'runtimeCompanions': len(raw), 'changedRuntimeFiles': changed, 'newChunks': sorted(new_chunks),
        'materializedBaselineChunks': materialized, 'completeChunksRequested': complete_chunks,
        'manifestSha256': digest(encode(manifest)), 'snapshotSha256': sha(wp / 'runtime-patches/current-snapshot.json'),
        'companionsChecked': validated.companions_checked, 'features': len(catalogue['features']), 'published': False}
    put(receipt_path, json.dumps(result, indent=2).encode() + b'\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'changedRuntimeFiles'}, indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--staging-root', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--node', default='node')
    parser.add_argument('--inventory-only-baseline', action='store_true', help='Skip baseline byte hashes only when independently verified; always check exact physical inventory')
    parser.add_argument('--complete-chunks', action='store_true', help='Materialize every unrestricted chunk locally from verified physical resources')
    parser.add_argument('--ai-detectors-qualification-proof', type=Path, help='Optional private retained D certificate; verified by SHA and never copied to public assets')
    args = parser.parse_args()
    assemble(args.source_root, args.staging_root, args.receipt, node=args.node,
        full_verify=not args.inventory_only_baseline, complete_chunks=args.complete_chunks,
        ai_detectors_qualification_proof=args.ai_detectors_qualification_proof)
