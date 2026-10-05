"""Reproducible browser-only transport adaptation; native WASM bytes stay intact."""
import hashlib
import json
import posixpath
import re

def adapted_runtime(relative, data, lookup, version):
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
    if '/src/' in relative and 'runtime-context.js?v=' not in text and re.search(r'(^|[;\n])\s*(?:import |export )', text):
        imports.append('import ' + json.dumps(module('runtime-context.js') + '?v=' + version) + ';')
    return ('\n'.join(imports) + '\n' + text).encode() if imports else data
