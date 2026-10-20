#!/usr/bin/env python3
"""Prepare public source/resources and a PRIVATE WordPress installer separately.

No network writes. Publication belongs to the GitHub thread. Resource blobs are
deduplicated and immutable; finalization pins the origin to its published commit.
"""
import argparse
import hashlib
import json
import mimetypes
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
import importlib.util
_spec = importlib.util.spec_from_file_location("runtime_delivery", Path(__file__).with_name("runtime-delivery.py"))
_delivery = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_delivery)
_offline_spec = importlib.util.spec_from_file_location('offline_shell', Path(__file__).with_name('offline-shell.py'))
_offline = importlib.util.module_from_spec(_offline_spec)
_offline_spec.loader.exec_module(_offline)
_feature_spec = importlib.util.spec_from_file_location('feature_catalog_builder', Path(__file__).parent/'scripts/generate-feature-catalog.py')
_features = importlib.util.module_from_spec(_feature_spec)
_feature_spec.loader.exec_module(_features)
from build import locked_files, delivery_bytes

CHUNK = 100_000_000
ROOT = Path(__file__).resolve().parent


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def mime(path):
    return {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
            '.json': 'application/json'}.get(Path(path).suffix, mimetypes.guess_type(path)[0] or 'application/octet-stream')


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def reviewed_publication_metadata(root, manifest, overlay):
    """Keep reviewed receipt identities when re-exporting an assembled runtime.

    Resource generation checks the active files. Historical orphan declarations
    and metadata ordering belong to the immutable reviewed inventory, not to a
    fresh traversal of those files. No model body is read by this metadata step.
    """
    root = Path(root)
    if not overlay.files:
        return None
    reviewed_bytes = (root.parents[1] / 'web-assets/manifest-template.json').read_bytes()
    reviewed = json.loads(reviewed_bytes)
    if (manifest['files'] != reviewed['files'] or manifest['slots'] != reviewed['slots']
            or manifest['remoteBase'] != reviewed['remoteBase']
            or len(manifest['localFiles']) != len(set(manifest['localFiles']))
            or set(manifest['localFiles']) != set(reviewed['localFiles'])
            or not {sha for file in manifest['files'].values() for sha in file['chunks']} <= set(manifest['chunks'])
            or any(reviewed['chunks'].get(sha) != size for sha, size in manifest['chunks'].items())):
        raise ValueError('Reconstructed resources differ from the reviewed publication inventory')
    return (reviewed_bytes, (root / 'runtime-source-lock.json').read_bytes(),
            (root / 'runtime-lock.json').read_bytes())


def pack(output, source_revision=None, local_only=None, resource_policy=None):
    lock, files = locked_files(ROOT)
    runtime_overlay = _delivery.qualified_runtime_overlay(ROOT)
    local_only = set(lock.get('localOnlyFiles', [])) | set(local_only or [])
    if any(not isinstance(name, str) or not name or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name for name in local_only):
        raise ValueError('Invalid local-only dependency path')
    if source_revision:
        source_revision = subprocess.check_output(['git', 'rev-parse', source_revision + '^{commit}'], cwd=ROOT, text=True).strip()
    prefix = subprocess.check_output(['git', 'rev-parse', '--show-prefix'], cwd=ROOT, text=True).strip() if source_revision else ''
    tracked = set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', source_revision, '--', '.'], cwd=ROOT, text=True).splitlines()) if source_revision else None
    # In a subdirectory git ls-tree prints paths relative to that directory.
    def source_bytes(source):
        name = source.relative_to(ROOT).as_posix()
        return subprocess.check_output(['git', 'show', source_revision + ':' + prefix + name], cwd=ROOT) if source_revision else source.read_bytes()
    version = re.search(r'Version:\s*([\d.]+)', source_bytes(ROOT / 'sherloq-browser/sherloq-browser.php').decode())[1]
    def runtime_data(relative):
        return files['assets/' + relative].read_bytes()
    resource = output / 'public' / 'web-assets'
    slots = [str(Path(r['destination']).relative_to('sherloq-browser/assets')) for r in lock['runtimes']]
    manifest = {'schema': 'sherloq.dependencies/1', 'remoteBase': None, 'slots': slots, 'files': {}, 'chunks': {}, 'localFiles': []}
    for name, source in files.items():
        relative = name.removeprefix('assets/')
        if not any(relative.startswith(s + '/') for s in slots):
            if tracked is None or source.relative_to(ROOT).as_posix() in tracked:
                put(output / 'public/web/wordpress/sherloq-browser' / name, source_bytes(source))
            continue
        restricted = relative in local_only
        original = source.read_bytes() if source.suffix in ['.js', '.mjs'] else None
        adapted = _delivery.adapted_runtime(relative, original, runtime_data, version) if original is not None else None
        if original is not None:
            adapted = runtime_overlay.apply(relative, original, adapted)
        chunks = []
        hasher = hashlib.sha256()
        size = 0
        stream = source.open('rb') if adapted is None else __import__('io').BytesIO(adapted)
        with stream:
            while data := stream.read(CHUNK):
                size += len(data)
                hasher.update(data)
                sha = digest(data)
                target = resource / 'chunks' / (sha + '.bin')
                if restricted:
                    pass  # Identity only: restricted payload is imported locally.
                elif not target.exists():
                    put(target, data)
                elif target.stat().st_size != len(data) or digest(target.read_bytes()) != sha:
                    raise ValueError('Existing chunk is corrupt: ' + sha)
                manifest['chunks'][sha] = len(data)
                chunks.append(sha)
        manifest['files'][relative] = {'sha256': hasher.hexdigest(), 'size': size, 'type': mime(relative), 'chunks': chunks}
        if restricted:
            manifest['files'][relative]['localOnly'] = True
        parts = Path(relative).parts
        small_source = source.suffix in ['.js', '.mjs', '.json'] and size <= 128 * 1024
        small_wasm = source.suffix == '.wasm' and size < 300 * 1024
        if not restricted and (small_wasm or (small_source and parts[0].endswith('engine') and len(parts) > 2 and parts[1] in ['src', 'vendor'])):
            manifest['localFiles'].append(relative)
            put(output / 'public/web/wordpress/sherloq-browser' / name, adapted if adapted is not None else source.read_bytes())
        # Readable runtime source and notices accompany the exact executable
        # resources. They are not fetched at startup simply because published.
        if not restricted and (source.suffix.lower() in {'.js', '.mjs', '.c', '.cc', '.cpp', '.h', '.hpp', '.py', '.sh', '.md', '.wgsl'} or any(x in source.name.lower() for x in ['license', 'notice', 'copyright'])):
            put(output / 'public/web/runtime-sources' / relative, adapted if adapted is not None else source.read_bytes())
    for name, record in runtime_overlay.extra_resources.items():
        if name in manifest['files']:
            if manifest['files'][name] != record:
                raise ValueError('Additional resource conflicts with a locked runtime: ' + name)
            continue
        manifest['files'][name] = record
        for identity in record['chunks']:
            source = ROOT.parents[1] / 'web-assets/chunks' / (identity + '.bin')
            data = source.read_bytes()
            if len(data) != record['size'] or digest(data) != identity:
                raise ValueError('Additional resource identity differs: ' + name)
            manifest['chunks'][identity] = len(data)
            put(resource / 'chunks' / (identity + '.bin'), data)
    if runtime_overlay.files:
        put(output / 'public/web/wordpress/sherloq-browser/assets/scientific-regions-delivery-increment.json',
            (ROOT / 'runtime-patches/batch-scientific-regions-20261013.json').read_bytes())
    ela_receipt = ROOT / 'runtime-patches/ela-runtime-20261014.json'
    if ela_receipt.exists():
        put(output / 'public/web/wordpress/sherloq-browser/assets/ela-delivery-increment.json', ela_receipt.read_bytes())
    if resource_policy is not None:
        if not isinstance(resource_policy, dict) or resource_policy.get('schema') != 'sherloq.resource-policy/1' or not isinstance(resource_policy.get('files'), dict):
            raise ValueError('Invalid resource policy')
        for name, record in resource_policy['files'].items():
            if not isinstance(name, str) or not name or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name or not any(name.startswith(slot + '/') for slot in slots):
                raise ValueError('Invalid resource policy path')
            if not isinstance(record, dict) or record.get('localOnly') is not True or not re.fullmatch('[a-f0-9]{64}', record.get('sha256', '')) or type(record.get('bytes')) is not int or record['bytes'] < 0 or not isinstance(record.get('chunks'), list):
                raise ValueError('Injected resource requires a local-only identity')
            parts = record['chunks']
            if any(not isinstance(part, dict) or not re.fullmatch('[a-f0-9]{64}', part.get('sha256', '')) or type(part.get('bytes')) is not int or not 0 < part['bytes'] <= CHUNK for part in parts) or sum(part['bytes'] for part in parts) != record['bytes']:
                raise ValueError('Invalid local-only resource chunks')
            entry = {'localOnly': True, 'sha256': record['sha256'], 'size': record['bytes'], 'type': mime(name), 'chunks': [part['sha256'] for part in parts]}
            if name in manifest['files'] and manifest['files'][name] != entry:
                raise ValueError('Resource policy conflicts with staged resource: ' + name)
            for part in parts:
                sha, size = part['sha256'], part['bytes']
                if sha in manifest['chunks'] and manifest['chunks'][sha] != size:
                    raise ValueError('Resource policy chunk identity conflicts')
                manifest['chunks'][sha] = size
            manifest['files'][name] = entry
            local_only.add(name)
    if local_only - set(manifest['files']):
        raise ValueError('Local-only files are absent from locked resources: ' + ', '.join(sorted(local_only - set(manifest['files']))))
    public_chunks = {sha for file in manifest['files'].values() if not file.get('localOnly') for sha in file['chunks']}
    restricted_chunks = {sha for file in manifest['files'].values() if file.get('localOnly') for sha in file['chunks']}
    if any((resource / 'chunks' / (sha + '.bin')).exists() for sha in restricted_chunks - public_chunks):
        raise ValueError('Restricted payload is already present in the public output; use a fresh output directory')
    retained = reviewed_publication_metadata(ROOT, manifest, runtime_overlay)
    if retained is not None:
        manifest_bytes, source_lock_bytes, delivered_lock_bytes = retained
        manifest = json.loads(manifest_bytes)
    else:
        manifest_bytes, source_lock_bytes = encode(manifest), encode(lock)
        delivered = json.loads(json.dumps(lock))
        delivered['deliveryAdapter'] = {'script': 'runtime-delivery.py', 'uiVersion': version,
                                      'sourceLock': 'runtime-source-lock.json'}
        for runtime in delivered['runtimes']:
            slot = str(Path(runtime['destination']).relative_to('sherloq-browser/assets'))
            runtime['files'] = {name: manifest['files'][slot + '/' + name]['sha256'] for name in runtime['files']}
        delivered_lock_bytes = encode(delivered)
    put(output / 'manifest-template.json', manifest_bytes)
    put(resource / 'manifest-template.json', manifest_bytes)
    # Source and executable metadata keep their distinct reviewed identities.
    put(output / 'public/web/wordpress/runtime-source-lock.json', source_lock_bytes)
    put(output / 'public/web/wordpress/runtime-lock.json', delivered_lock_bytes)
    for name in ['build.py', 'runtime-delivery.py', 'runtime-extensions.py', 'runtime-rita.py', 'runtime-interactive.py', 'offline-shell.py', 'prepare-distribution.py', 'restore-dependencies.py', 'DISTRIBUTION.md', 'package.json', 'package-lock.json']:
        put(output / 'public/web/wordpress' / name, source_bytes(ROOT / name))
    extensions_receipt = ROOT / 'runtime-patches/browser-extensions-20261015.json'
    if extensions_receipt.is_file():
        put(output / 'public/web/wordpress/sherloq-browser/assets/extensions-delivery-increment.json', extensions_receipt.read_bytes())
    rita_receipt = ROOT / 'runtime-patches/rita-20261019.json'
    if rita_receipt.is_file():
        put(output / 'public/web/wordpress/sherloq-browser/assets/rita-delivery-increment.json', rita_receipt.read_bytes())
    interactive_receipt = ROOT / 'runtime-patches/interactive-20261020.json'
    if interactive_receipt.is_file():
        put(output / 'public/web/wordpress/sherloq-browser/assets/interactive-delivery-increment.json', interactive_receipt.read_bytes())
    for name in ['resource-policy.json', 'method-resource-assembly.json']:
        source = ROOT / name
        if source.is_file() and (tracked is None or name in tracked):
            put(output / 'public/web/wordpress' / name, source_bytes(source))
    if resource_policy is not None:
        put(output / 'public/web/wordpress/resource-policy.json', encode(resource_policy))
    for folder in ['tests', 'scripts', 'runtime-patches', 'offline-launcher', 'compatibility-manifests', 'feature-inputs']:
        for source in (ROOT / folder).rglob('*'):
            if source.is_file() and source.suffix in {'.js', '.mjs', '.py', '.json', '.html', '.go', '.mod'} and 'fixtures' not in source.parts:
                if tracked is None or source.relative_to(ROOT).as_posix() in tracked:
                    put(output / 'public/web/wordpress' / source.relative_to(ROOT), source_bytes(source))
    report = {'schema': 'sherloq.distribution-preparation/1', 'runtimeFiles': len(manifest['files']),
              'runtimeBytes': sum(f['size'] for f in manifest['files'].values()), 'uniqueChunks': len(public_chunks),
              'publicRuntimeBytes': sum(f['size'] for f in manifest['files'].values() if not f.get('localOnly')), 'declaredChunks': len(manifest['chunks']),
              'uniqueBytes': sum(manifest['chunks'][sha] for sha in public_chunks), 'chunkLimit': CHUNK,
              'localOnlyFiles': sorted(local_only), 'publicChunks': len(public_chunks),
              'publicDirectory': 'public', 'privateInstallerDirectory': 'private',
              'published': False, 'sourceRevision': source_revision, 'runtimeLockSha256': digest((ROOT / 'runtime-lock.json').read_bytes())}
    put(output / 'preparation.json', encode(report))
    return report


def stage_engine_source(output, repository, commit):
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('An exact engine commit is required')
    temporary = output / 'engine-source.tar'
    destination = output / 'public/web/engine-source'
    subprocess.run(['git', '-C', str(repository), 'archive', commit, '-o', str(temporary.resolve())], check=True)
    try:
        with tarfile.open(temporary) as archive:
            archive.extractall(destination, filter='data')
    finally:
        temporary.unlink(missing_ok=True)
    version = json.loads(subprocess.check_output(['git', '-C', str(repository), 'show', commit + ':package.json'], text=True))['version']
    put(output / 'public/web/engine-source-identity.json', encode({'commit': commit, 'snapshot': 'engine-source', 'runtime': version}))


def finalize(output, origin, *, offline=False, local_test=False, private_overlay=None):
    if not offline:
        github = re.fullmatch(r'https://raw\.githubusercontent\.com/[^/]+/[^/]+/[a-f0-9]{40}/(?:[\w.-]+/)*', origin or '')
        local = local_test and re.fullmatch(r'http://(?:127\.0\.0\.1|localhost):\d+/(?:[\w.-]+/)*', origin or '')
        if not (github or local):
            raise ValueError('Supply a raw.githubusercontent.com origin pinned to a 40-character commit SHA')
    manifest = json.loads((output / 'manifest-template.json').read_text())
    manifest['remoteBase'] = origin if not offline else None
    data = encode(manifest)
    identity = digest(data)
    installer_directory = output / 'private'
    installer_directory.mkdir(parents=True, exist_ok=True)
    staging = tempfile.TemporaryDirectory(prefix='.sherloq-build-', dir=installer_directory)
    plugin = Path(staging.name) / 'sherloq-browser'
    sources = output / 'public/web/wordpress/sherloq-browser'
    version = re.search(r'Version:\s*([\d.]+)', (sources / 'sherloq-browser.php').read_text())[1]
    for source in sources.rglob('*'):
        if not source.is_file():
            continue
        name = source.relative_to(sources).as_posix()
        data = delivery_bytes(name, source, version)
        if data is None:
            data = source.read_bytes()
        if name.startswith('assets/') and name.endswith('.html'):
            data = data.replace(b"connect-src 'self'", b"connect-src 'self' https://raw.githubusercontent.com")
            if local_test:
                data = data.replace(b"connect-src 'self'", b"connect-src 'self' http://127.0.0.1:* http://localhost:*")
        put(plugin / name, data)
    # Classic SW works in Firefox/WebKit too. Only module syntax is removed from
    # these reviewed dependency files; runtime bytes remain untouched.
    worker = '\n'.join(re.sub(r'^import .*;\n', '', (sources / 'assets' / name).read_text(), flags=re.M).replace('export ', '')
                       for name in ['dependency-core.js', 'dependency-store.js', 'dependency-tar.js', 'offline-kit-core.js', 'dependency-manifest.js', 'dependency-client-routing.js', 'dependency-sw.js'])
    put(plugin / 'assets/dependency-sw.js', worker.encode())
    offline_worker = '\n'.join(re.sub(r'^import .*;\n', '', (sources / 'assets' / name).read_text(), flags=re.M).replace('export ', '') for name in ['dependency-core.js', 'dependency-store.js', 'dependency-tar.js', 'offline-kit-core.js', 'feature-catalog.js', 'local-update-store.js', 'offline-browser-store.js', 'offline-browser-sw.js'])
    put(plugin / 'assets/offline-browser-sw.js', offline_worker.encode())
    put(plugin / ('assets/dependency-manifest-' + identity + '.json'), encode(manifest))
    # An old installed worker requests its own immutable manifest before it can
    # serve the page that installs the replacement. WordPress replaces the
    # plugin directory; retaining these small inventories is part of migration.
    for previous in (output / 'public/web/wordpress/compatibility-manifests').glob('*.json'):
        if previous.stem != digest(previous.read_bytes()):
            raise ValueError('Compatibility manifest identity mismatch: ' + previous.name)
        put(plugin / ('assets/dependency-manifest-' + previous.name), previous.read_bytes())
    put(plugin / 'assets/dependency-config.json', encode({'schema': 'sherloq.dependency-config/1', 'enabled': True, 'workerType': 'classic', 'workerVersion': version, 'manifest': identity}))
    if (sources/'assets/local-management-ui.js').is_file():
        catalog = _features.generate(manifest, output/'public/web/wordpress/feature-inputs', sources/'assets')
        put(plugin / 'assets/feature-catalog.json', encode(catalog))
    scientific_receipt = output/'public/web/wordpress/runtime-patches/batch-scientific-regions-20261013.json'
    if scientific_receipt.is_file():
        put(plugin / 'assets/scientific-regions-delivery-increment.json', scientific_receipt.read_bytes())
    _offline.write_shell(plugin, manifest, identity, version)
    if private_overlay:
        for source in Path(private_overlay).rglob('*'):
            if source.is_file() and '.git' not in source.parts and source.suffix in ['.php', '.js']:
                name = source.relative_to(private_overlay).as_posix()
                put(plugin / name, (delivery_bytes(name, source, version) or source.read_bytes()).replace(b'__SHERLOQ_VERSION__', version.encode()))
        with (plugin / 'sherloq-browser.php').open('a') as f:
            f.write("\nrequire_once __DIR__ . '/private/report.php';\n")
        app = plugin / 'assets/app.html'
        app.write_text(app.read_text().replace('</body>', '<script type="module" src="private-report.js?v=' + version + '"></script></body>'))
    names = sorted(p for p in plugin.rglob('*') if p.is_file())
    size = sum(p.stat().st_size for p in names)
    archive = output / 'private' / ('sherloq-browser-' + version + ('-offline' if offline else '-github') + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in names:
            z.write(p, 'sherloq-browser/' + p.relative_to(plugin).as_posix())
    if archive.stat().st_size > 25_000_000:
        archive.unlink()
        raise ValueError('Compressed private bootstrap ZIP exceeds 25,000,000 bytes')
    result = {'installer': archive.name, 'bytes': archive.stat().st_size, 'uncompressedBytes': size, 'sha256': digest(archive.read_bytes()), 'origin': manifest['remoteBase'], 'manifest': identity, 'private': True, 'originConfigured': bool(origin and not local_test), 'publishedOriginVerified': False}
    # This directory is generated packaging output. Start from the reviewed
    # public inputs on each finalization; retain deployed manifests only through
    # compatibility-manifests, never stale test origins or a previous overlay.
    destination = installer_directory / 'sherloq-browser'
    if destination.exists():
        shutil.rmtree(destination)
    plugin.replace(destination)
    staging.cleanup()
    put(output / 'private/receipt.json', encode(result))
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--private-overlay', type=Path, help='Private site integration; included only in the private installer')
    p.add_argument('--finalize', action='store_true', help='Use already packed resources')
    p.add_argument('--origin', help='Immutable GitHub raw URL ending with /web-assets/')
    p.add_argument('--offline', action='store_true', help='Private candidate; requires importing resources before analysis')
    p.add_argument('--local-test', action='store_true', help='Allow localhost fixture origin; never distribute this artifact')
    p.add_argument('--engine-source', type=Path, help='Export the complete committed engine source tree')
    p.add_argument('--engine-commit', default='70473081aab0767f9ea10613001e444847e2d9db')
    p.add_argument('--source-revision', help='Package committed UI sources, excluding unrelated working edits')
    p.add_argument('--local-only-manifest', type=Path, help='JSON list (or files list) of restricted paths: retain identities for local import without publishing payloads')
    p.add_argument('--resource-policy', type=Path, help='Reviewed sherloq.resource-policy/1 metadata for local-only files absent from physical runtime slots')
    a = p.parse_args()
    local_only = None
    if a.local_only_manifest:
        local_only = json.loads(a.local_only_manifest.read_text())
        if isinstance(local_only, dict):
            local_only = local_only.get('files')
        if not isinstance(local_only, list) or any(not isinstance(name, str) for name in local_only):
            raise ValueError('Local-only manifest must contain a list of dependency paths')
    if not a.finalize:
        policy = json.loads(a.resource_policy.read_text()) if a.resource_policy else None
        print(json.dumps(pack(a.output, a.source_revision, local_only, policy), indent=2))
    if a.engine_source:
        stage_engine_source(a.output, a.engine_source, a.engine_commit)
    if a.origin or a.offline or a.finalize:
        print(json.dumps(finalize(a.output, a.origin, offline=a.offline, local_test=a.local_test, private_overlay=a.private_overlay), indent=2))
