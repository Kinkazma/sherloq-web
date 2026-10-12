import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const wordpress = fileURLToPath(new URL('../', import.meta.url));
const setup = String.raw`
import hashlib, importlib.util, json, re, shutil, sys, tempfile
from pathlib import Path

real = Path(sys.argv[1])
temporary = tempfile.TemporaryDirectory(prefix='sherloq-methods-identity-')
root = Path(temporary.name)
wp = root / 'web/wordpress'
engine = root / 'web/engine-source'
primary = wp / 'sherloq-browser/assets'
fallback = root / 'fallback'
resources = root / 'resources'
output = root / 'staged'
for p in (primary, fallback, resources, output, wp / 'scripts'):
    p.mkdir(parents=True)
shutil.copyfile(real / 'runtime-delivery.py', wp / 'runtime-delivery.py')

def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data.encode() if isinstance(data, str) else data)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def module(name, source, previous=None):
    relative = 'unified-engine/vendor/' + name + '/module.wasm'
    put(engine / ('vendor/' + name + '/module.wasm'), source)
    put(engine / ('vendor/' + name + '/module.js'),
        'const wasm=new URL("module.wasm",import.meta.url);'
        'async function instantiateAsync(binary,binaryFile,imports){return legacyFetch()}'
        'function getWasmImports(){return {}}')
    if previous is not None:
        put(fallback / relative, previous)
    return relative

wasm = b'\x00asm\x01\x00\x00\x00'
updated = wasm + b'\x00\x02\x01x'  # Valid custom section, distinct byte identity.
new_path = module('new', updated)
changed_path = module('changed', updated, wasm)
shared_path = module('shared', wasm, wasm)
put(engine / 'src/entry.js', 'export const currentSource = true;')
put(engine / 'package.json', '{"type":"module"}')
models = {}
for name, path, data in (
    ('selfdm', 'selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx', b'fixture-selfdm'),
    ('eloftr', 'aliked-eloftr/export/efficient-loftr-full-fp32.onnx', b'fixture-eloftr'),
):
    put(resources / path, data)
    models[name] = {'bytes':len(data), 'sha256':sha(data)}
component_data = b'fixture-proposal-component'
cv_data = wasm
component_identity = {'file':'component.onnx', 'bytes':len(component_data), 'sha256':sha(component_data)}
cv_identity = {'file':'seeds.wasm', 'bytes':len(cv_data), 'sha256':sha(cv_data)}
proposal_path = 'selfdm-ssg/proposal-browser-candidate/integration-bundle/selfdm-proposal-bundle.json'
proposal_data = json.dumps({'schema':1, 'family':'selfdm-proposal', 'models':{'selfdm':component_identity}, 'cv':cv_identity}).encode()
put(resources / proposal_path, proposal_data)
put(resources / Path(proposal_path).parent / component_identity['file'], component_data)
put(resources / Path(proposal_path).parent / cv_identity['file'], cv_data)
models['proposal'] = {'bytes':len(proposal_data), 'sha256':sha(proposal_data)}
put(engine / 'src/selfdm-proposal-assets.js', 'export const SELFDM_PROPOSAL_MODELS=' + json.dumps({'selfdm':component_identity}) + ';export const SELFDM_PROPOSAL_CV=' + json.dumps(cv_identity) + ';')
put(engine / 'experiments/segmentation/models.js',
    'export const SEGMENTATION_MODELS=' + json.dumps({'selfdm-map':models['selfdm'], 'selfdm-proposal':models['proposal']}) + ';')
put(engine / 'src/efficient-loftr-assets.js',
    'export const EFFICIENT_LOFTR_ASSET=' + json.dumps(models['eloftr']) + ';')
put(fallback / 'individual-assets/individual-models.json',
    json.dumps({'segmentation':{}, 'm3':{}}))
for name in ('app.html', 'app.js', 'session-log.js'):
    put(primary / name, '/* ui 0.15.2, engine 0.35.0-export.3 */')
put(primary / 'integrated-config.json', json.dumps({
    'engineCommit':'qualified-base', 'engineVersion':'0.35.0-export.3',
    'runtimeReceiptSha256':'qualified-base-receipt', 'assetBase':'./unified-assets/',
}))

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

stage = load('stage_methods', real / 'scripts/stage-methods.py')
stage.__file__ = str(wp / 'scripts/stage-methods.py')

def loader_identity(folder, relative):
    loader = (folder / relative.replace('.wasm', '.js')).read_text()
    return re.search(r'"sha256":"([a-f0-9]{64})"', loader).group(1)

def delivered(relative):
    for directory in (output, primary, fallback):
        candidate = directory / relative
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(relative)
`;

function python(body) {
  return JSON.parse(execFileSync('python3', ['-c', setup + '\n' + body, wordpress], {encoding:'utf8'}));
}

test('staging delivers every exact WASM identity used by its generated loaders without duplicating a qualified binary', () => {
  const result = python(String.raw`
# Reproduce the prior source-only staging behavior, using the same transport adapter.
source = (real / 'scripts/stage-methods.py').read_text()
source = source[:source.index("    for path in sorted(engine.rglob('*.wasm')):")] + source[source.index("    for directory in ('src', 'vendor', 'experiments'):"):]
legacy = {'__file__':str(wp / 'scripts/stage-methods.py'), '__name__':'legacy_stage'}
exec(compile(source, '<legacy-source-only-staging>', 'exec'), legacy)
old = root / 'legacy'
legacy['stage'](fallback, resources, old, 'test-local')
assert not (old / new_path).exists() and not (fallback / new_path).exists()
assert loader_identity(old, changed_path) != sha((fallback / changed_path).read_bytes())

receipt = stage.stage(fallback, resources, output, 'test-local')
for path in (new_path, changed_path, shared_path):
    assert loader_identity(output, path) == sha(delivered(path).read_bytes()), path
assert (output / new_path).read_bytes() == updated
assert (output / changed_path).read_bytes() == updated
assert not (output / shared_path).exists()
assert receipt[shared_path]['storage'] == 'qualified-fallback'
assert (fallback / changed_path).read_bytes() == wasm
assert 'runtime-context.js?v=test-local' in (output / 'unified-engine/src/entry.js').read_text()
assert 'legacyFetch()' not in (output / changed_path.replace('.wasm','.js')).read_text()
manifest = json.loads((output / 'individual-assets/individual-models.json').read_text())
assert manifest['segmentation']['selfdm-map']['sha256'] == models['selfdm']['sha256']
assert manifest['segmentation']['selfdm-map']['url'] == '../integration-resources/selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx'
assert not list(output.rglob('*.staging'))
print(json.dumps({'oldMissing':True, 'oldMismatch':True, 'exactDelivered':3, 'fallbackUnchanged':True}))
`);
  assert.deepEqual(result, {oldMissing:true, oldMismatch:true, exactDelivered:3, fallbackUnchanged:true});
});

test('restaging a reverted WASM cannot leave an obsolete staged binary in front of its qualified fallback', () => {
  const result = python(String.raw`
stage.stage(fallback, resources, output, 'test-local')
assert (output / changed_path).read_bytes() == updated
put(engine / 'vendor/changed/module.wasm', wasm)
receipt = stage.stage(fallback, resources, output, 'test-local')
assert receipt[changed_path]['storage'] == 'qualified-fallback'
assert loader_identity(output, changed_path) == sha(delivered(changed_path).read_bytes())
assert not (output / changed_path).exists(), 'Obsolete staged binary shadows the qualified fallback'
print(json.dumps({'revertedExact':True, 'obsoleteRemoved':True}))
`);
  assert.deepEqual(result, {revertedExact:true, obsoleteRemoved:true});
});

test('the local configuration distinguishes current content identity from its qualified baseline', () => {
  const result = python(String.raw`
receipt = stage.stage(fallback, resources, output, 'test-local')
config = json.loads((output / 'integrated-config.json').read_text())
expected = sha(json.dumps({key:value['sha256'] for key,value in receipt.items() if key.startswith('unified-engine/')}, sort_keys=True, separators=(',',':')).encode())
assert config['engineCommit'] == 'local-content-sha256:' + expected
assert config['runtimeSourceIncrementSha256'] == expected
assert config['baseEngineCommit'] == 'qualified-base'
assert config['localMethodBuild']['baseRuntimeReceiptSha256'] == 'qualified-base-receipt'
assert 'runtimeReceiptSha256' not in config
assert config['localMethodBuild']['scope'] == 'local research only'
assert config['engineVersion'] == '0.36.0-methods.1'
assert config['assetBase'] == './unified-assets/'
assert 'engine 0.36.0-methods.1' in (output / 'session-log.js').read_text()
put(engine / 'src/entry.js', 'export const currentSource = "new revision";')
stage.stage(fallback, resources, output, 'test-local')
changed = json.loads((output / 'integrated-config.json').read_text())
assert changed['engineCommit'] != config['engineCommit']
assert changed['baseEngineCommit'] == config['baseEngineCommit']
assert (primary / 'integrated-config.json').read_text() == json.dumps({'engineCommit':'qualified-base', 'engineVersion':'0.35.0-export.3', 'runtimeReceiptSha256':'qualified-base-receipt', 'assetBase':'./unified-assets/'})
print(json.dumps({'currentContentIdentity':True, 'baselineRetained':True, 'sourceRevisionDetected':True}))
`);
  assert.deepEqual(result, {currentContentIdentity:true, baselineRetained:true, sourceRevisionDetected:true});
});

test('local preview routes select staged, source, model and fallback files consistently without starting a server', () => {
  const result = python(String.raw`
stage.stage(fallback, resources, output, 'test-local')
preview = load('preview_methods', real / 'scripts/preview-methods.py')
preview.__file__ = str(wp / 'scripts/preview-methods.py')
class FakeServer:
    def __init__(self, address, handler):
        self.server_port = 0
        self.handler = handler
        preview.test_handler = handler
    def serve_forever(self):
        pass
preview.ThreadingHTTPServer = FakeServer
sys.argv = ['preview-methods.py', '--fallback', str(fallback), '--resources', str(resources), '--staged', str(output), '--receipt', str(root / 'server.json')]
# Suppress the preview URL printed by main; no socket is opened by FakeServer.
import contextlib, io
with contextlib.redirect_stdout(io.StringIO()):
    preview.main()
handler = object.__new__(preview.test_handler)
assert Path(handler.translate_path('/' + changed_path + '?v=test-local')) == (output / changed_path).resolve()
assert Path(handler.translate_path('/' + shared_path)) == (fallback / shared_path).resolve()
assert Path(handler.translate_path('/engine-source/src/entry.js')) == (engine / 'src/entry.js').resolve()
put(fallback / 'unified-engine/vendor/fallback-only.wasm', wasm)
assert Path(handler.translate_path('/engine-source/vendor/fallback-only.wasm')) == (fallback / 'unified-engine/vendor/fallback-only.wasm').resolve()
assert Path(handler.translate_path('/integration-resources/selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx')) == (resources / 'selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx').resolve()
assert Path(handler.translate_path('/integration-resources/%2e%2e/outside')) == (primary / '.invalid-request').resolve()
assert handler.guess_type('module.wasm') == 'application/wasm'
assert handler.guess_type('worker.mjs') == 'text/javascript'
print(json.dumps({'pathsExact':True, 'traversalRejected':True, 'noSocket':True}))
`);
  assert.deepEqual(result, {pathsExact:true, traversalRejected:true, noSocket:true});
});

test('a model candidate with the wrong hash cannot replace a previously verified local manifest', () => {
  const result = python(String.raw`
stage.stage(fallback, resources, output, 'test-local')
before = (output / 'individual-assets/individual-models.json').read_bytes()
put(resources / 'selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx', b'corrupted-model')
try:
    stage.stage(fallback, resources, output, 'test-local')
    raise AssertionError('Mismatched model accepted')
except ValueError as error:
    assert 'Local model differs from engine identity: selfdm' in str(error)
assert (output / 'individual-assets/individual-models.json').read_bytes() == before
print(json.dumps({'wrongModelRejected':True, 'verifiedManifestPreserved':True}))
`);
  assert.deepEqual(result, {wrongModelRejected:true, verifiedManifestPreserved:true});
});
