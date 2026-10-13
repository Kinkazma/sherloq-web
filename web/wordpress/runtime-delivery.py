"""Reproducible browser-only transport adaptation; native WASM bytes stay intact."""
import hashlib
import json
import posixpath
import re
from pathlib import Path, PurePosixPath
from copy import deepcopy

# These model manifests pin the original factory bytes, and their callers pass
# a separately fetched, SHA-verified wasmBinary. Rewriting the loader would
# break that second identity and offers no additional download protection.
VERIFIED_BINARY_FACTORIES = frozenset({
    'individual-assets/m3/ssg/edges.mjs',
    'individual-assets/m3/ssg/edges-shared.mjs',
    'individual-assets/segmentation/selfdm-proposal/proposal-cv.mjs',
    'unified-engine/vendor/selfdm-proposal/proposal-cv.mjs',
})

def _encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()

def _digest(data):
    return hashlib.sha256(data).hexdigest()

class QualifiedRuntimeOverlay:
    """Replay only a reviewed additive increment after the ordinary adapter.

    The complete locks and inventory bind the input snapshot. Undoing the
    declared entries must reconstruct the prior locks byte for byte. This is
    deliberately separate from adapted_runtime: every undeclared file keeps
    its existing transport adaptation.
    """
    def __init__(self, root):
        root = Path(root)
        self.files = {}
        receipt_path = root / 'runtime-patches/batch-scientific-regions-20261013.json'
        if not receipt_path.exists():
            return
        repository = root.parents[1]
        receipt = json.loads(receipt_path.read_bytes())
        if receipt.get('schema') != 'sherloq.batch-scientific-regions-runtime-increment/1':
            raise ValueError('Unsupported qualified runtime increment')
        records = receipt.get('files', [])
        if len(records) != 57 or len({r.get('file') for r in records}) != 57:
            raise ValueError('Qualified runtime increment must declare its 57 exact files')
        def read_record(record):
            name = record['file']
            parts = PurePosixPath(name)
            if parts.is_absolute() or any(p in ['', '..', '.'] for p in name.split('/')) or '\\' in name:
                raise ValueError('Unsafe qualified runtime identity')
            data = (repository / name).read_bytes()
            if _digest(data) != record['sha256']:
                raise ValueError('Qualified runtime metadata changed: ' + name)
            return data
        manifest = json.loads(read_record(receipt['manifest']))
        selection = json.loads(read_record(receipt['baseline']['selectionOverlay']))
        for kind in ['source', 'delivered']:
            current = json.loads(read_record(receipt['locks'][kind]))
            previous = deepcopy(current)
            slot = next(r for r in previous['runtimes'] if r['destination'] == 'sherloq-browser/assets/unified-engine')
            before_key = 'sourceBeforeSha256' if kind == 'source' else 'deliveredBeforeSha256'
            after_key = 'sourceAfter' if kind == 'source' else 'after'
            current_slot = next(r for r in current['runtimes'] if r['destination'] == slot['destination'])
            for record in records:
                name = record['file'].removeprefix('unified-engine/')
                if current_slot['files'].get(name) != record[after_key]['sha256']:
                    raise ValueError('Qualified runtime lock differs: ' + name)
                before = record[before_key]
                if before is None:
                    if not record['added']:
                        raise ValueError('Missing prior runtime identity: ' + name)
                    del slot['files'][name]
                else:
                    slot['files'][name] = before
            expected = receipt['baseline']['locks'][kind]['sha256']
            if _digest(_encoded(previous)) != expected or expected != selection['locks'][kind]['sha256']:
                raise ValueError('Qualified increment does not reconstruct its prior runtime lock')
        previous_manifest = deepcopy(manifest)
        for record in records:
            name = record['file']
            if not name.startswith('unified-engine/') or manifest['files'].get(name) != record['after'] or record['after'].get('localOnly'):
                raise ValueError('Qualified runtime descriptor differs: ' + name)
            if record['before'] is None:
                del previous_manifest['files'][name]
            else:
                previous_manifest['files'][name] = record['before']
        before_chunks = {sha for f in previous_manifest['files'].values() for sha in f['chunks']}
        # The incoming template has no orphan chunks. The candidate retains
        # those original pieces as well as each new, declared small piece.
        new_chunks = {r['after']['sha256'] for r in records}
        for sha in new_chunks - before_chunks:
            del previous_manifest['chunks'][sha]
        added_local = set(receipt['manifest']['addedLocalFiles'])
        previous_manifest['localFiles'] = [p for p in previous_manifest['localFiles'] if p not in added_local]
        if _digest(_encoded(previous_manifest)) != receipt['baseline']['manifest']['sha256']:
            raise ValueError('Qualified increment does not reconstruct its prior dependency inventory')
        for record in records:
            name = record['file']
            if not re.fullmatch(r'unified-engine/(?:[\w.-]+/)*[\w.-]+\.(?:js|mjs|json|wasm)', name):
                raise ValueError('Unsafe qualified runtime override: ' + name)
            if record['after']['size'] > 512_000:
                raise ValueError('Unreviewed large qualified runtime override')
            if name.endswith('.wasm') and (name != 'unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm' or record['after']['sha256'] != 'a479db700aa63e8663226f1ddd653d01c8e5982d35a8086fdbe0778002bffe10'):
                raise ValueError('Unreviewed qualified native binary')
            # Only the fixed plugin location can supply these bytes.
            if record['asset'] != 'web/wordpress/sherloq-browser/assets/' + name:
                raise ValueError('Qualified runtime asset path differs')
            data = (repository / record['asset']).read_bytes()
            if len(data) != record['after']['size'] or _digest(data) != record['after']['sha256']:
                raise ValueError('Qualified runtime bytes changed: ' + name)
            if manifest['chunks'].get(record['after']['sha256']) != len(data) or record['after']['chunks'] != [record['after']['sha256']]:
                raise ValueError('Qualified runtime chunk identity differs: ' + name)
            self.files[name] = record

    def apply(self, relative, source, adapted):
        record = self.files.get(relative)
        if record is None:
            return adapted
        if len(source) != record['after']['size'] or _digest(source) != record['after']['sha256']:
            raise ValueError('Qualified runtime replay input changed: ' + relative)
        # This full reviewed replacement follows baseline transport preparation.
        # It must not be passed to the generic adapter a second time.
        return source

def qualified_runtime_overlay(root):
    return QualifiedRuntimeOverlay(root)

def adapted_runtime(relative, data, lookup, version):
    if relative in VERIFIED_BINARY_FACTORIES:
        return data
    if not relative.endswith(('.js', '.mjs')):
        return data
    text = data.decode('utf-8')
    imports = []
    def module(name):
        value = posixpath.relpath(name, posixpath.dirname(relative))
        return value if value.startswith('.') else './' + value
    signature = 'async function instantiateAsync(binary,binaryFile,imports)'
    if signature in text and 'import {instantiateDependency} from ' not in text and "function findWasmBinary(){return binaryDecode(" not in text:
        # The generated transport function has a stable body in these locked builds.
        pattern = re.escape(signature) + r'\{.*?\}function getWasmImports\('
        match = re.search(pattern, text, re.S)
        if not match:
            raise ValueError('Unreviewed Emscripten transport: ' + relative)
        wasm = posixpath.splitext(relative)[0] + '.wasm'
        # Some generated names differ from the output JS name (e.g. codecs).
        candidates = re.findall(r'new URL\("([^"/]+\.wasm)",import.meta.url\)', text)
        if len(set(candidates)) == 1:
            wasm = posixpath.join(posixpath.dirname(relative), candidates[0])
        binary = lookup(wasm)
        expected = {'size': len(binary), 'sha256': hashlib.sha256(binary).hexdigest()}
        replacement = signature + '{return instantiateDependency(binary,binaryFile,imports,' + json.dumps(expected, separators=(',', ':')) + ')}function getWasmImports('
        text = text[:match.start()] + replacement + text[match.end():]
        imports.append('import {instantiateDependency} from ' + json.dumps(module('runtime-dependency.js') + '?v=' + version) + ';')
    # Module workers inherit the session identity through their constructor URL.
    # ES module side effects run before any worker entrypoint or lazy native init.
    if '/src/' in relative and 'runtime-context.js?v=' not in text and re.search(r'(^|[;\n])\s*(?:import |export )|\bimport\s*\(', text):
        imports.append('import ' + json.dumps(module('runtime-context.js') + '?v=' + version) + ';')
    return ('\n'.join(imports) + '\n' + text).encode() if imports else data
