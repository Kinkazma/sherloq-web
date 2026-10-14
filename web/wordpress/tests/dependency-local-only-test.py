"""Small real pack/restore fixtures, without copying or publishing model payloads."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


delivery = module('delivery_fixture', 'runtime-delivery.py')
packer = module('packer_fixture', 'prepare-distribution.py')
restorer = module('restore_fixture', 'restore-dependencies.py')
sha = lambda value: hashlib.sha256(value).hexdigest()
wasm = b'\x00asm\x01\x00\x00\x00'
factory = b'''export async function create(binary){return instantiateAsync(binary,"unused.wasm",{})}async function instantiateAsync(binary,binaryFile,imports){if(binary)return WebAssembly.instantiate(binary,imports);return WebAssembly.instantiate(await(await fetch(binaryFile)).arrayBuffer(),imports)}function getWasmImports(){return {}}'''
for path in delivery.VERIFIED_BINARY_FACTORIES:
    actual = delivery.adapted_runtime(path, factory, lambda _: (_ for _ in ()).throw(AssertionError('binary lookup')), 'test')
    assert actual == factory and sha(actual) == sha(factory)
assert b'instantiateDependency' in delivery.adapted_runtime('individual-assets/other/factory.mjs', factory, lambda _: wasm, 'test')
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    native_factory = root / 'factory.mjs'
    native_factory.write_bytes(factory)
    # Execute the unchanged factory with a valid provided binary. It must not
    # issue a fallback network request or replace the already verified binary.
    subprocess.run(['node', '--input-type=module', '-e',
                    'globalThis.fetch=()=>{throw Error("unexpected duplicate fetch")};'
                    'const f=await import('+json.dumps(native_factory.as_uri())+');'
                    'const r=await f.create(Uint8Array.of(0,97,115,109,1,0,0,0));'
                    'if(!(r.instance instanceof WebAssembly.Instance))throw Error("missing instance");'], check=True)
    staged = root / 'staged'
    plugin = staged / 'sherloq-browser'
    (plugin / 'assets/individual-assets/m3/ssg').mkdir(parents=True)
    (plugin / 'sherloq-browser.php').write_text('Version: 0.17.2\n')
    public = b'public bytes'
    restricted = b'restricted model'
    a, b = sha(public), sha(restricted)
    model = plugin / 'assets/individual-assets/public.onnx'
    model.write_bytes(public)
    script = plugin / 'assets/individual-assets/m3/ssg/edges.mjs'
    script.write_bytes(factory)
    lock = {'schema': 'sherloq.wordpress-runtime-lock/1', 'runtimes': [
        {'destination': 'sherloq-browser/assets/individual-assets', 'version': 'test',
         'files': {'public.onnx': a, 'm3/ssg/edges.mjs': sha(factory)}}]}
    (staged / 'runtime-lock.json').write_text(json.dumps(lock))
    for name in ['build.py', 'runtime-delivery.py', 'offline-shell.py', 'prepare-distribution.py', 'restore-dependencies.py', 'DISTRIBUTION.md', 'package.json', 'package-lock.json']:
        (staged / name).write_text('fixture\n')
    packer.ROOT = staged
    packer.locked_files = lambda _: (lock, {'sherloq-browser.php': plugin / 'sherloq-browser.php', 'assets/individual-assets/public.onnx': model, 'assets/individual-assets/m3/ssg/edges.mjs': script})
    policy = {'schema': 'sherloq.resource-policy/1', 'files': {
        'individual-assets/local.onnx': {'localOnly': True, 'sha256': b, 'bytes': len(restricted), 'chunks': [{'sha256': b, 'bytes': len(restricted)}]}}}
    output = root / 'output'
    receipt = packer.pack(output, resource_policy=policy)
    manifest = json.loads((output / 'manifest-template.json').read_text())
    assert json.loads((output / 'public/web/wordpress/resource-policy.json').read_text()) == policy
    assert manifest['files']['individual-assets/local.onnx']['localOnly'] is True
    assert not (output / 'public/web-assets/chunks' / (b + '.bin')).exists()
    assert (output / 'public/web-assets/chunks' / (a + '.bin')).read_bytes() == public
    assert (output / 'public/web-assets/chunks' / (sha(factory) + '.bin')).read_bytes() == factory
    assert receipt['uniqueBytes'] == len(public) + len(factory)
    # Simulate only the read-only Git boundary, including nested ls-tree paths.
    # No test commit or repository mutation is necessary to verify that the
    # frozen UI ignores modified and untracked working files.
    revision = 'a'*40
    frozen_files = {p.relative_to(staged).as_posix():p.read_bytes() for p in staged.rglob('*') if p.is_file()}
    check_output = subprocess.check_output
    def frozen_git(command, **options):
        if command[0] != 'git': return check_output(command, **options)
        if command[1:] == ['rev-parse', revision+'^{commit}']: return revision+'\n'
        if command[1:] == ['rev-parse', '--show-prefix']: return 'staged/\n'
        if command[1:] == ['ls-tree', '-r', '--name-only', revision, '--', '.']: return '\n'.join(sorted(frozen_files))+'\n'
        if command[1] == 'show' and command[2].startswith(revision+':staged/'):
            return frozen_files[command[2].removeprefix(revision+':staged/')]
        raise AssertionError('Unexpected Git operation: '+repr(command))
    (plugin / 'sherloq-browser.php').write_text('Version: 99.0.0\n')
    (plugin / 'private.php').write_text('untracked private integration\n')
    frozen = root / 'frozen'
    subprocess.check_output = frozen_git
    try:
        packer.pack(frozen, source_revision=revision, resource_policy=policy)
    finally:
        subprocess.check_output = check_output
    assert (frozen / 'public/web/wordpress/sherloq-browser/sherloq-browser.php').read_text() == 'Version: 0.17.2\n'
    assert not (frozen / 'public/web/wordpress/sherloq-browser/private.php').exists()
    (plugin / 'sherloq-browser.php').write_text('Version: 0.17.2\n')
    # Finalizing twice must not accumulate old test manifests or private files.
    sources = frozen / 'public/web/wordpress/sherloq-browser'
    (sources / 'assets').mkdir(exist_ok=True)
    for name in ['dependency-core.js', 'dependency-store.js', 'dependency-tar.js', 'offline-kit-core.js', 'feature-catalog.js', 'local-update-store.js', 'dependency-manifest.js', 'dependency-sw.js', 'offline-browser-store.js', 'offline-browser-sw.js']:
        (sources / 'assets' / name).write_text('')
    # The current worker bundle also declares this small production helper.
    # Exercise its real source without changing optional-model policy fixtures.
    (sources / 'assets/dependency-client-routing.js').write_bytes(
        (ROOT / 'sherloq-browser/assets/dependency-client-routing.js').read_bytes())
    compatibility = frozen / 'public/web/wordpress/compatibility-manifests'
    compatibility.mkdir()
    previous = b'{"previous":true}\n'
    (compatibility / (sha(previous)+'.json')).write_bytes(previous)
    packer._offline.write_shell = lambda *args: None
    first = packer.finalize(frozen, 'http://127.0.0.1:8081/', local_test=True)
    installer = frozen / 'private/sherloq-browser'
    (installer / 'stale-private.php').write_text('old private overlay\n')
    second = packer.finalize(frozen, 'http://127.0.0.1:8082/', local_test=True)
    assert first['manifest'] != second['manifest']
    assert not (installer / 'assets' / ('dependency-manifest-'+first['manifest']+'.json')).exists()
    assert (installer / 'assets' / ('dependency-manifest-'+second['manifest']+'.json')).exists()
    assert (installer / 'assets' / ('dependency-manifest-'+sha(previous)+'.json')).read_bytes() == previous
    assert not (installer / 'stale-private.php').exists()
    chunks = output / 'public/web-assets/chunks'
    target = root / 'restored'
    assert restorer.restore(output / 'manifest-template.json', target, chunks) == 2
    assert (target / 'individual-assets/public.onnx').read_bytes() == public
    assert not (target / 'individual-assets/local.onnx').exists()
    restorer.urllib.request.urlopen = lambda _: (_ for _ in ()).throw(AssertionError('restricted network request'))
    try:
        restorer.restore(output / 'manifest-template.json', target, chunks,
                         'https://raw.githubusercontent.com/example/repo/'+ 'a'*40+'/web-assets/', True)
        raise AssertionError('missing local model accepted')
    except ValueError as error:
        assert 'MODEL_LOCAL_REQUIRED' in str(error)
    # A private local chunk makes the optional file restorable byte-for-byte;
    # no proprietary installed-library format is introduced.
    private_chunks = root / 'private-chunks'
    private_chunks.mkdir()
    (private_chunks / (b + '.bin')).write_bytes(restricted)
    assert restorer.restore(output / 'manifest-template.json', target, private_chunks, include_local_only=True) == 1
    assert (target / 'individual-assets/local.onnx').read_bytes() == restricted
    (target / 'individual-assets/local.onnx').unlink()
    (private_chunks / (b + '.bin')).write_bytes(b'wrong bytes')
    try:
        restorer.restore(output / 'manifest-template.json', target, private_chunks, include_local_only=True)
        raise AssertionError('corrupt local model accepted')
    except ValueError as error:
        assert 'Corrupt chunk' in str(error)
    assert not (target / 'individual-assets/local.onnx').exists()
    # Reusing a dirty public output cannot silently publish a restricted blob.
    (chunks / (b + '.bin')).write_bytes(restricted)
    try:
        packer.pack(output, resource_policy=policy)
        raise AssertionError('restricted payload in public output accepted')
    except ValueError as error:
        assert 'Restricted payload' in str(error)
    for bad_path in ('../escape', 'unlocked/local.onnx'):
        invalid = {'schema': 'sherloq.resource-policy/1', 'files': {bad_path: policy['files']['individual-assets/local.onnx']}}
        try:
            packer.pack(root / 'invalid', resource_policy=invalid)
            raise AssertionError('unsafe injected path accepted')
        except ValueError as error:
            assert 'policy path' in str(error)

print(json.dumps({'publicPack': True, 'restore': True, 'factoryIdentity': True}))
