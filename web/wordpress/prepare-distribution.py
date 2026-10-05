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
import zipfile
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


def pack(output, source_revision=None):
    lock, files = locked_files(ROOT)
    if source_revision:
        source_revision = subprocess.check_output(['git', 'rev-parse', source_revision + '^{commit}'], cwd=ROOT, text=True).strip()
    prefix = subprocess.check_output(['git', 'rev-parse', '--show-prefix'], cwd=ROOT, text=True).strip() if source_revision else ''
    tracked = set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', source_revision, '--', prefix or '.'], cwd=ROOT, text=True).splitlines()) if source_revision else None
    # In a subdirectory git ls-tree prints paths relative to that directory.
    def source_bytes(source):
        name = source.relative_to(ROOT).as_posix()
        return subprocess.check_output(['git', 'show', source_revision + ':' + prefix + name], cwd=ROOT) if source_revision else source.read_bytes()
    resource = output / 'public' / 'web-assets'
    slots = [str(Path(r['destination']).relative_to('sherloq-browser/assets')) for r in lock['runtimes']]
    manifest = {'schema': 'sherloq.dependencies/1', 'remoteBase': None, 'slots': slots, 'files': {}, 'chunks': {}, 'localFiles': []}
    for name, source in files.items():
        relative = name.removeprefix('assets/')
        if not any(relative.startswith(s + '/') for s in slots):
            if tracked is None or source.relative_to(ROOT).as_posix() in tracked:
                put(output / 'public/web/wordpress/sherloq-browser' / name, source_bytes(source))
            continue
        chunks = []
        with source.open('rb') as stream:
            while data := stream.read(CHUNK):
                sha = digest(data)
                target = resource / 'chunks' / (sha + '.bin')
                if not target.exists():
                    put(target, data)
                elif target.stat().st_size != len(data) or digest(target.read_bytes()) != sha:
                    raise ValueError('Existing chunk is corrupt: ' + sha)
                manifest['chunks'][sha] = len(data)
                chunks.append(sha)
        file_hash = next(r['files'][str(source.relative_to(ROOT / r['destination']))] for r in lock['runtimes'] if source.is_relative_to(ROOT / r['destination']))
        manifest['files'][relative] = {'sha256': file_hash, 'size': source.stat().st_size, 'type': mime(relative), 'chunks': chunks}
        parts = Path(relative).parts
        if parts[0].endswith('engine') and len(parts) > 2 and parts[1] in ['src', 'vendor'] and source.suffix in ['.js', '.mjs', '.json'] and source.stat().st_size <= 128 * 1024:
            manifest['localFiles'].append(relative)
            put(output / 'public/web/wordpress/sherloq-browser' / name, source.read_bytes())
        # Readable runtime source and notices accompany the exact executable
        # resources. They are not fetched at startup simply because published.
        if source.suffix.lower() in {'.js', '.mjs', '.c', '.cc', '.cpp', '.h', '.hpp', '.py', '.sh', '.md', '.wgsl'} or any(x in source.name.lower() for x in ['license', 'notice', 'copyright']):
            put(output / 'public/web/runtime-sources' / relative, source.read_bytes())
    put(output / 'manifest-template.json', encode(manifest))
    put(resource / 'manifest-template.json', encode(manifest))
    put(output / 'public/web/wordpress/runtime-lock.json', encode(lock))
    for name in ['build.py', 'prepare-distribution.py', 'restore-dependencies.py', 'DISTRIBUTION.md', 'package.json', 'package-lock.json']:
        put(output / 'public/web/wordpress' / name, source_bytes(ROOT / name))
    for folder in ['tests', 'scripts', 'runtime-patches']:
        for source in (ROOT / folder).rglob('*'):
            if source.is_file() and source.suffix in {'.js', '.mjs', '.py', '.json', '.html'} and 'fixtures' not in source.parts:
                if tracked is None or source.relative_to(ROOT).as_posix() in tracked:
                    put(output / 'public/web/wordpress' / source.relative_to(ROOT), source_bytes(source))
    report = {'schema': 'sherloq.distribution-preparation/1', 'runtimeFiles': len(manifest['files']),
              'runtimeBytes': sum(f['size'] for f in manifest['files'].values()), 'uniqueChunks': len(manifest['chunks']),
              'uniqueBytes': sum(manifest['chunks'].values()), 'chunkLimit': CHUNK,
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


def finalize(output, origin, *, offline=False, local_test=False):
    if not offline:
        github = re.fullmatch(r'https://raw\.githubusercontent\.com/[^/]+/[^/]+/[a-f0-9]{40}/(?:[\w.-]+/)*', origin or '')
        local = local_test and re.fullmatch(r'http://(?:127\.0\.0\.1|localhost):\d+/(?:[\w.-]+/)*', origin or '')
        if not (github or local):
            raise ValueError('Supply a raw.githubusercontent.com origin pinned to a 40-character commit SHA')
    manifest = json.loads((output / 'manifest-template.json').read_text())
    manifest['remoteBase'] = origin if not offline else None
    data = encode(manifest)
    identity = digest(data)
    plugin = output / 'private' / 'sherloq-browser'
    sources = output / 'public/web/wordpress/sherloq-browser'
    version = re.search(r'Version:\s*([\d.]+)', (sources / 'sherloq-browser.php').read_text())[1]
    for source in sources.rglob('*'):
        if not source.is_file():
            continue
        name = source.relative_to(sources).as_posix()
        data = delivery_bytes(name, source, version)
        if data is None:
            data = source.read_bytes()
        if name in ['assets/app.html', 'assets/panel.html']:
            data = data.replace(b"connect-src 'self'", b"connect-src 'self' https://raw.githubusercontent.com")
            if local_test:
                data = data.replace(b"connect-src 'self'", b"connect-src 'self' http://127.0.0.1:* http://localhost:*")
        put(plugin / name, data)
    # Classic SW works in Firefox/WebKit too. Only module syntax is removed from
    # these three reviewed dependency files; runtime bytes remain untouched.
    worker = '\n'.join(re.sub(r'^import .*;\n', '', (sources / 'assets' / name).read_text(), flags=re.M).replace('export ', '')
                       for name in ['dependency-core.js', 'dependency-store.js', 'dependency-tar.js', 'dependency-sw.js'])
    put(plugin / 'assets/dependency-sw.js', worker.encode())
    put(plugin / ('assets/dependency-manifest-' + identity + '.json'), encode(manifest))
    put(plugin / 'assets/dependency-config.json', encode({'schema': 'sherloq.dependency-config/1', 'enabled': True, 'workerType': 'classic', 'manifest': identity}))
    names = sorted(p for p in plugin.rglob('*') if p.is_file() and not (p.name.startswith('dependency-manifest-') and p.name != 'dependency-manifest-' + identity + '.json'))
    size = sum(p.stat().st_size for p in names)
    if size > 20_000_000:
        raise ValueError('Private bootstrap package exceeds 20 MB')
    archive = output / 'private' / ('sherloq-browser-' + version + ('-offline' if offline else '-github') + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in names:
            z.write(p, 'sherloq-browser/' + p.relative_to(plugin).as_posix())
    result = {'installer': archive.name, 'bytes': archive.stat().st_size, 'uncompressedBytes': size, 'sha256': digest(archive.read_bytes()), 'origin': manifest['remoteBase'], 'manifest': identity, 'private': True, 'originConfigured': bool(origin and not local_test), 'publishedOriginVerified': False}
    put(output / 'private/receipt.json', encode(result))
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--finalize', action='store_true', help='Use already packed resources')
    p.add_argument('--origin', help='Immutable GitHub raw URL ending with /web-assets/')
    p.add_argument('--offline', action='store_true', help='Private candidate; requires importing resources before analysis')
    p.add_argument('--local-test', action='store_true', help='Allow localhost fixture origin; never distribute this artifact')
    p.add_argument('--engine-source', type=Path, help='Export the complete committed engine source tree')
    p.add_argument('--engine-commit', default='70473081aab0767f9ea10613001e444847e2d9db')
    p.add_argument('--source-revision', help='Package committed UI sources, excluding unrelated working edits')
    a = p.parse_args()
    if not a.finalize:
        print(json.dumps(pack(a.output, a.source_revision), indent=2))
    if a.engine_source:
        stage_engine_source(a.output, a.engine_source, a.engine_commit)
    if a.origin or a.offline or a.finalize:
        print(json.dumps(finalize(a.output, a.origin, offline=a.offline, local_test=a.local_test), indent=2))
