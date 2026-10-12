"""Apply only the admitted memory cap to the pinned ORT1.30 bootstraps."""

def admitted_growth(source, name):
    anchors = {
        'ort-wasm-simd-threaded.mjs': ('if("load"===c){let e=[];', 'd', 'postMessage({Rb:"load",'),
        'ort-wasm-simd-threaded.asyncify.mjs': ('if("load"===d){let e=[];', 'c', 'postMessage({$c:"load",'),
    }
    load, message, send = anchors[name]
    start = 'async function ortWasmThreaded(moduleArg={}){var moduleRtn;'
    marker = '__sherloqHeapMaximum'
    if marker in source:
        assert all(part in source for part in (
            'var '+marker+'=globalThis.__m3MaximumWasmPages*65536;',
            marker+'='+message+'.'+marker+';', send+marker+','
        )) and '4294901760' not in source, 'Partial or unfamiliar ORT cap adaptation'
        return source
    assert source.count(start) == source.count(load) == source.count(send) == 1
    assert source.count('4294901760') == 3, 'Unfamiliar ORT resize guard/helper'
    assert source.count('maximum:globalThis.__m3MaximumWasmPages') == 1
    # The pthread bootstrap has its own global object. Propagate the owner's
    # cap in the existing load message before the child instantiates its WASM.
    source = source.replace(start, start+'var '+marker+'=globalThis.__m3MaximumWasmPages*65536;')
    source = source.replace(load, load+marker+'='+message+'.'+marker+';')
    source = source.replace(send, send+marker+',')
    return source.replace('4294901760', marker)
