#!/usr/bin/env python3
"""Build/install only the reviewed UI and locked, immutable runtime deliveries.

Updating runtime-lock.json is a separate reviewed source change. A build never
creates a new trusted baseline from whatever happens to be staged or live.
"""
from pathlib import Path, PurePosixPath
import argparse
import importlib.util
import hashlib
import json
import re
import shutil
import subprocess
import zipfile


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def relative(value):
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or '..' in path.parts or '\\' in value:
        raise ValueError('Unsafe runtime path: ' + value)
    return Path(*path.parts)


def delivery_bytes(name, source, version):
    """Give each UI release fresh module URLs, including transitive imports.

    The runtime blobs stay byte-identical to their reviewed receipts. HTTP
    revalidation still applies; query versions also avoid a cached UI graph
    being reused when only the top-level app.html URL changed.
    """
    if not re.fullmatch(r'assets/[^/]+\.(?:js|html)', name):
        return None
    value = source.read_text()
    if name.endswith('.js'):
        value = re.sub(r'''(['"])(\./[^/'"?]+\.(?:m?js|html|json))(?:\?v=[^'"]*)?\1''',
                       lambda m: m[1] + m[2] + '?v=' + version + m[1], value)
    else:
        value = re.sub(r'''((?:src|href)=['"])([\w./-]+\.(?:js|css))(?:\?v=[^'"]*)?(['"])''',
                       lambda m: m[1] + m[2] + '?v=' + version + m[3], value)
    return value.encode()


def locked_files(root):
    lock = json.loads((root / 'runtime-lock.json').read_text())
    if lock.get('schema') != 'sherloq.wordpress-runtime-lock/1' or not lock.get('runtimes'):
        raise ValueError('A reviewed runtime lock is required')
    plugin = root / 'sherloq-browser'
    files = {}
    for runtime in lock['runtimes']:
        destination = relative(runtime['destination'])
        if destination.parts[:2] != ('sherloq-browser', 'assets'):
            raise ValueError('Runtime destination must be inside plugin assets')
        target = root / destination
        expected = runtime['files']
        actual = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
        if actual != set(expected):
            raise ValueError(f"Locked runtime {runtime['version']} file list differs: "
                             f"missing={sorted(set(expected)-actual)}, extra={sorted(actual-set(expected))}")
        for name, digest in expected.items():
            source = target / relative(name)
            if sha(source) != digest:
                raise ValueError(f"Locked runtime {runtime['version']} changed: {name}")
            files[source.relative_to(plugin).as_posix()] = source
    # Also includes dependencies staged through a directory symlink in a worktree.
    for source in plugin.rglob('*'):
        if source.is_file():
            files.setdefault(source.relative_to(plugin).as_posix(), source)
    return lock, dict(sorted(files.items()))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', type=Path)
    parser.add_argument('--zip', action='store_true')
    parser.add_argument('--sources-zip', action='store_true', help='Freeze source repository only; not an installable plugin ZIP')
    parser.add_argument('--dependencies-zip', action='store_true', help='Separate locked offline dependency bundle; no deployment')
    parser.add_argument('--frozen', action='store_true', help='Compatibility spelling; all builds enforce runtime-lock.json')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    plugin = root / 'sherloq-browser'
    if args.install and args.install.name != 'sherloq-browser':
        raise ValueError('Destination must be the plugin directory')
    # Validate before any writes, deletions, manifest replacement, or installation.
    lock, files = locked_files(root)
    if args.zip and (plugin / 'assets/energy-engine').exists():
        raise ValueError('Energy candidate is local-only: qualify external dependencies before producing a distribution ZIP.')
    version = re.search(r'Version:\s*([\d.]+)', (plugin/'sherloq-browser.php').read_text()).group(1)
    prepared = {name: value for name, source in files.items()
                if (value := delivery_bytes(name, source, version)) is not None}
    spec = importlib.util.spec_from_file_location('runtime_delivery', root / 'runtime-delivery.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    slots = [relative(r['destination']).relative_to('sherloq-browser').as_posix() + '/' for r in lock['runtimes']]
    for name, source in files.items():
        if source.suffix in ['.js', '.mjs'] and any(name.startswith(slot) for slot in slots):
            prepared[name] = adapter.adapted_runtime(name.removeprefix('assets/'), source.read_bytes(),
                lambda p: files['assets/' + p].read_bytes(), version)
    manifest = {name: hashlib.sha256(prepared[name]).hexdigest() if name in prepared else sha(source)
                for name, source in files.items()}
    if args.install:
        # Runtime removals are scoped to the locked slots, not arbitrary site files.
        for runtime in lock['runtimes']:
            slot = relative(runtime['destination']).relative_to('sherloq-browser')
            installed = args.install / slot
            for old in installed.rglob('*'):
                if old.is_file() and old.relative_to(args.install).as_posix() not in manifest:
                    old.unlink()
        for name, source in files.items():
            output = args.install / name
            output.parent.mkdir(parents=True, exist_ok=True)
            if name in prepared:
                output.write_bytes(prepared[name])
            else:
                shutil.copyfile(source, output)
        if any(sha(args.install / name) != digest for name, digest in manifest.items()):
            raise ValueError('Installation hash mismatch')
        print('Installed and verified', len(files), 'files against locked runtimes')
    if args.zip:
        folder = root / 'dist'
        folder.mkdir(exist_ok=True)
        version = re.search(r'Version:\s*([\d.]+)', (plugin/'sherloq-browser.php').read_text()).group(1)
        with zipfile.ZipFile(folder/f'sherloq-browser-{version}-local.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, source in files.items():
                info = zipfile.ZipInfo('sherloq-browser/'+name, date_time=(2026, 9, 29, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, prepared.get(name, source.read_bytes()))
        print('Local ZIP', len(files), 'files')
    if args.sources_zip or args.dependencies_zip:
        folder = root / 'dist'
        folder.mkdir(exist_ok=True)
        version = re.search(r'Version:\s*([\d.]+)', (plugin/'sherloq-browser.php').read_text()).group(1)
        def freeze(label, entries):
            output = folder / f'sherloq-browser-{version}-{label}.zip'
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
                for name, source in sorted(entries.items()):
                    info = zipfile.ZipInfo(name, date_time=(2026, 10, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    archive.writestr(info, source.read_bytes())
            print(label, output.stat().st_size, sha(output))
        if args.sources_zip:
            subprocess.check_call(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=root)
            names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
            freeze('sources', {name: root / relative(name) for name in names if name})
        if args.dependencies_zip:
            slots = [relative(r['destination']).relative_to('sherloq-browser').as_posix()+'/' for r in lock['runtimes']]
            freeze('offline-dependencies', {'sherloq-browser/'+name: source for name, source in files.items() if any(name.startswith(slot) for slot in slots)})
    (root/'build-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
