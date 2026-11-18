#!/usr/bin/env python3
"""Explicit, pinned reconstruction of the two precision variants.

The official delegate bootstrap is an input, not a claimed local rebuild of
its24components. Nothing in the image runtime invokes this build script.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
RECIPE_NAMES = ['native-magick.c', 'native-cache-io.c', 'build-native.py',
                'fetch-sources.py', 'patch-source-metadata.py',
                'SOURCE-REFS.json', 'SOURCE-ARCHIVES.json', 'SOURCE-PATCHES.json',
                'DEPENDENCY-SOURCE-REFS.json', 'source-metadata.patch',
                'TOOLCHAIN.json', 'QUALIFIED.json']


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while block := stream.read(1024 ** 2):
            value.update(block)
    return value.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def one_executable(root, prefix, name):
    candidates = list((root / prefix.split('/')[0]).glob('/'.join(prefix.split('/')[1:]) + '/' + name))
    candidates = [p for p in candidates if p.is_file()]
    if len(candidates) != 1:
        raise ValueError('Expected one pinned bundled executable: ' + prefix + '/' + name)
    return candidates[0]


def toolchain(sdk, work, lock, node_override=None, python_override=None):
    if (sdk / 'upstream/.emsdk_version').read_text().strip() != lock['emsdkInstalledIdentity']:
        raise ValueError('SDK release identity differs')
    if read_json(sdk / 'emscripten-releases-tags.json')['releases'][lock['emscriptenVersion']] != lock['emsdkReleaseHash']:
        raise ValueError('SDK release map differs')
    node = node_override.resolve() if node_override else one_executable(sdk, 'node/' + lock['nodeVersion'][1:] + '_*', 'bin/node')
    python = python_override.resolve() if python_override else one_executable(sdk, 'python/' + lock['pythonVersion'] + '_*', 'bin/python3')
    env = {**os.environ, 'EMSDK': str(sdk), 'EM_CONFIG': str(HERE / 'emscripten-config.py'),
           'EM_CACHE': str(work / 'toolchain-cache'), 'NATIVE_MAGICK_BUILD_ROOT': str(work),
           'NATIVE_MAGICK_NODE': str(node), 'NATIVE_MAGICK_PYTHON': str(python),
           'PYTHONDONTWRITEBYTECODE': '1', 'LC_ALL': 'C', 'TZ': 'UTC'}
    env['PATH'] = str(sdk / 'upstream/emscripten') + os.pathsep + env['PATH']
    commands = {'emcc': [sdk / 'upstream/emscripten/emcc', '--version'],
                'clang': [sdk / 'upstream/bin/clang', '--version'],
                'binaryen': [sdk / 'upstream/bin/wasm-opt', '--version'],
                'node': [node, '--version'], 'python': [python, '--version']}
    versions = {key: subprocess.check_output(list(map(str, command)), env=env, text=True).splitlines()[0]
                for key, command in commands.items()}
    if lock['emscriptenVersion'] not in versions['emcc'] or lock['emscriptenCommit'] not in versions['emcc']:
        raise ValueError('Emscripten version/commit differs')
    if lock['llvmCommit'] not in versions['clang'] or versions['binaryen'] != lock['binaryenVersion']:
        raise ValueError('LLVM/Binaryen identity differs')
    if versions['node'] != lock['nodeVersion'] or versions['python'] != 'Python ' + lock['pythonVersion']:
        raise ValueError('Bundled Node/Python version differs')
    files = ['upstream/.emsdk_version', 'upstream/emscripten/emcc.py',
             'upstream/emscripten/em++.py', 'upstream/emscripten/tools/building.py',
             'upstream/emscripten/tools/shared.py', 'upstream/emscripten/src/settings.js',
             'upstream/bin/clang', 'upstream/bin/wasm-ld', 'upstream/bin/wasm-opt']
    fingerprint = {name: {'bytes': (sdk / name).stat().st_size, 'sha256': digest(sdk / name)} for name in files}
    return env, {'release': lock['emsdkReleaseHash'], 'versions': versions, 'files': fingerprint}


def copy_file(source, target):
    """Independent work files; a filesystem clone may share immutable extents."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if sys.platform == 'darwin':
        result = subprocess.run(['cp', '-c', str(source), str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            return
    shutil.copy2(source, target)


def command(args, env, work, log_name):
    print('PHASE ' + log_name, flush=True)
    with (work / log_name).open('w') as log:
        completed = subprocess.run(list(map(str, args)), env=env, cwd=work,
                                   stdout=log, stderr=subprocess.STDOUT)
    if completed.returncode:
        raise RuntimeError(log_name + ' failed with exit ' + str(completed.returncode))


def compare_pair(work, quantum, expected):
    folder = work / ('output-paged' if quantum == 16 else 'output-q32-paged')
    rows = []
    for name, pin in expected.items():
        path = folder / name
        actual = {'bytes': path.stat().st_size, 'sha256': digest(path)}
        # This only reads outputs. Never rewrite or strip a mismatching binary.
        rows.append({'file': name, 'expected': pin, 'actual': actual, 'exact': actual == pin})
    return {'quantumDepth': quantum, 'files': rows, 'exact': all(v['exact'] for v in rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--archive-cache', type=Path)
    parser.add_argument('--node', type=Path, help='Optional matching Node executable when not bundled by the SDK')
    parser.add_argument('--python', type=Path, help='Optional matching Python executable when not bundled by the SDK')
    parser.add_argument('--quantum', choices=['16', '32', 'both'], default='both')
    parser.add_argument('--jobs', type=int, choices=[1, 2], default=2)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    sdk, work = args.sdk.resolve(), args.work_dir.resolve()
    if work == HERE or HERE.is_relative_to(work) or work.is_relative_to(HERE) or work == sdk or sdk.is_relative_to(work) or work.is_relative_to(sdk):
        raise ValueError('Work directory must be separate from recipe sources and SDK')
    if work.exists() and any(work.iterdir()) and not args.resume:
        raise ValueError('Work directory is not empty; use a new directory or explicit --resume')
    work.mkdir(parents=True, exist_ok=True)
    cache = work / 'toolchain-cache'
    if cache.is_symlink():
        raise ValueError('The build must own its SDK system-library cache')
    cache.mkdir(exist_ok=True)
    for name in RECIPE_NAMES:
        copy_file(HERE / name, work / name)
    lock, qualified = read_json(HERE / 'TOOLCHAIN.json'), read_json(HERE / 'QUALIFIED.json')
    env, sdk_before = toolchain(sdk, work, lock, args.node, args.python)
    env.update({'CODEC_BUILD_JOBS': str(args.jobs), 'EMCC_CORES': str(args.jobs),
                'BINARYEN_CORES': str(args.jobs), 'CMAKE_BUILD_PARALLEL_LEVEL': str(args.jobs)})
    write_json(work / 'SDK-BEFORE.json', sdk_before)
    report = {'schema': 'sherloq.native-magick-clean-rebuild/1', 'state': 'preparing',
              'dependencyMode': 'official-pinned-bootstrap-not-local-delegate-rebuild',
              'sdkCacheMode': 'isolated-work-cache',
              'toolchain': sdk_before, 'jobs': args.jobs, 'requestedQuantumDepths': [16,32] if args.quantum == 'both' else [int(args.quantum)], 'pairs': [], 'errors': []}
    try:
        print('PHASE isolated SDK system-library cache in work directory', flush=True)
        archives = work / 'archives'
        archives.mkdir(exist_ok=True)
        pins = read_json(HERE / 'SOURCE-ARCHIVES.json')
        if args.archive_cache:
            for name, pin in pins.items():
                filename = name + ('.zip' if pin['url'].endswith('.zip') else '.tar.gz')
                source, target = args.archive_cache.resolve() / filename, archives / filename
                if source.is_file() and not target.exists():
                    if source.stat().st_size != pin['bytes'] or digest(source) != pin['sha256']:
                        raise ValueError('Archive cache identity differs: ' + name)
                    copy_file(source, target)
        command([sys.executable, HERE / 'fetch-sources.py'], env, work, 'FETCH.log')
        command([sys.executable, HERE / 'patch-source-metadata.py'], env, work, 'PATCH.log')
        actual_patches = read_json(work / 'SOURCE-PATCHES.json')
        if actual_patches != read_json(HERE / 'SOURCE-PATCHES.json'):
            raise ValueError('Patched Core identities differ from qualified source; preserve PATCH.log and stop')
        if digest(work / 'native-magick.c') != qualified['wrapperSha256'] or digest(work / 'native-cache-io.c') != qualified['cacheBridgeSha256']:
            raise ValueError('Native wrapper/bridge source differs')
        report['state'] = 'prepared'
        write_json(work / 'REBUILD-REPORT.json', report)
        if args.prepare_only:
            print('PHASE preparation complete; no native compilation requested', flush=True)
            return 0
        for quantum, key in [(16, 'quantum16'), (32, 'quantum32')]:
            if quantum not in report['requestedQuantumDepths']:
                continue
            flags = ['--paged-cache'] + (['--quantum32'] if quantum == 32 else [])
            command([sys.executable, HERE / 'build-native.py', *flags], env, work, 'BUILD-Q' + str(quantum) + '.log')
            pair = compare_pair(work, quantum, qualified[key])
            report['pairs'].append(pair)
            write_json(work / 'REBUILD-REPORT.json', report)
            print('PHASE compare Q' + str(quantum) + ': ' + ('BYTE-IDENTICAL' if pair['exact'] else 'DIFFERENT, PRESERVED'), flush=True)
        _, sdk_after = toolchain(sdk, work, lock, args.node, args.python)
        write_json(work / 'SDK-AFTER.json', sdk_after)
        report['sdkUnchanged'] = sdk_before == sdk_after
        report['state'] = 'byte-identical' if report['sdkUnchanged'] and all(p['exact'] for p in report['pairs']) else 'difference-preserved'
        return 0 if report['state'] == 'byte-identical' else 2
    except BaseException as error:
        report['state'] = 'failed'
        report['errors'].append({'type': type(error).__name__, 'message': str(error)})
        raise
    finally:
        write_json(work / 'REBUILD-REPORT.json', report)


if __name__ == '__main__':
    raise SystemExit(main())
