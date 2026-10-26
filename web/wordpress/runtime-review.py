"""Verify the native inspection and interaction source increment."""
from pathlib import Path, PurePosixPath
from copy import deepcopy
import hashlib, json, re
VERSION = '0.25.0'
SOURCES = {'extension-engine/bfree.js': 'web/extensions-source/bfree.js', 'extension-engine/comprint-parallel-statistics.js': 'web/extensions-source/comprint-parallel-statistics.js', 'extension-engine/doctamper-bounded.js': 'web/extensions-source/doctamper-bounded.js', 'extension-engine/source-window.js': 'web/extensions-source/source-window.js', 'extension-engine/spai.js': 'web/extensions-source/spai.js', 'unified-engine/experiments/d2prl/analysis.js': 'web/engine-source/experiments/d2prl/analysis.js', 'unified-engine/src/adaifl.js': 'web/engine-source/src/adaifl.js', 'unified-engine/src/automatic-analysis-session.js': 'web/engine-source/src/automatic-analysis-session.js', 'unified-engine/src/automatic-runtime.js': 'web/engine-source/src/automatic-runtime.js', 'unified-engine/src/bit-planes.js': 'web/engine-source/src/bit-planes.js', 'unified-engine/src/blob-source.js': 'web/engine-source/src/blob-source.js', 'unified-engine/src/c2pa-validation.js': 'web/engine-source/src/c2pa-validation.js', 'unified-engine/src/c2pa-worker.js': 'web/engine-source/src/c2pa-worker.js', 'unified-engine/src/cached-parameter-preview.js': 'web/engine-source/src/cached-parameter-preview.js', 'unified-engine/src/catnet-analyzer.js': 'web/engine-source/src/catnet-analyzer.js', 'unified-engine/src/catnet-map-geometry.js': 'web/engine-source/src/catnet-map-geometry.js', 'unified-engine/src/catnet-segmented-analyzer.js': 'web/engine-source/src/catnet-segmented-analyzer.js', 'unified-engine/src/cfa-analyzer.js': 'web/engine-source/src/cfa-analyzer.js', 'unified-engine/src/clone-relations.d.ts': 'web/engine-source/src/clone-relations.d.ts', 'unified-engine/src/clone-relations.js': 'web/engine-source/src/clone-relations.js', 'unified-engine/src/composite-owner-release.js': 'web/engine-source/src/composite-owner-release.js', 'unified-engine/src/composite-segmented-analyzer.js': 'web/engine-source/src/composite-segmented-analyzer.js', 'unified-engine/src/composite-segmented-display.js': 'web/engine-source/src/composite-segmented-display.js', 'unified-engine/src/composite-source-noise.js': 'web/engine-source/src/composite-source-noise.js', 'unified-engine/src/defect-pixels.js': 'web/engine-source/src/defect-pixels.js', 'unified-engine/src/derive-original.js': 'web/engine-source/src/derive-original.js', 'unified-engine/src/digest-stream.js': 'web/engine-source/src/digest-stream.js', 'unified-engine/src/digest.js': 'web/engine-source/src/digest.js', 'unified-engine/src/echo-cache.js': 'web/engine-source/src/echo-cache.js', 'unified-engine/src/exiftool-runtime.js': 'web/engine-source/src/exiftool-runtime.js', 'unified-engine/src/exiftool-worker.js': 'web/engine-source/src/exiftool-worker.js', 'unified-engine/src/exiftool.js': 'web/engine-source/src/exiftool.js', 'unified-engine/src/external-memory-cache.js': 'web/engine-source/src/external-memory-cache.js', 'unified-engine/src/external-preview-admission.js': 'web/engine-source/src/external-preview-admission.js', 'unified-engine/src/focal.js': 'web/engine-source/src/focal.js', 'unified-engine/src/forgeryscope-analyzer.js': 'web/engine-source/src/forgeryscope-analyzer.js', 'unified-engine/src/forgeryscope-source-analyzer.js': 'web/engine-source/src/forgeryscope-source-analyzer.js', 'unified-engine/src/illuminant.js': 'web/engine-source/src/illuminant.js', 'unified-engine/src/image-sources.js': 'web/engine-source/src/image-sources.js', 'unified-engine/src/index.d.ts': 'web/engine-source/src/index.d.ts', 'unified-engine/src/index.js': 'web/engine-source/src/index.js', 'unified-engine/src/m2-worker-client.js': 'web/engine-source/src/m2-worker-client.js', 'unified-engine/src/m2-worker-host.js': 'web/engine-source/src/m2-worker-host.js', 'unified-engine/src/magnifier.js': 'web/engine-source/src/magnifier.js', 'unified-engine/src/media-codec-worker.js': 'web/engine-source/src/media-codec-worker.js', 'unified-engine/src/media-image-source.js': 'web/engine-source/src/media-image-source.js', 'unified-engine/src/media-raster-export.js': 'web/engine-source/src/media-raster-export.js', 'unified-engine/src/median.js': 'web/engine-source/src/median.js', 'unified-engine/src/metadata-structure-source.js': 'web/engine-source/src/metadata-structure-source.js', 'unified-engine/src/metadata.js': 'web/engine-source/src/metadata.js', 'unified-engine/src/minmax.js': 'web/engine-source/src/minmax.js', 'unified-engine/src/noisesniffer.js': 'web/engine-source/src/noisesniffer.js', 'unified-engine/src/owned-byte-source.js': 'web/engine-source/src/owned-byte-source.js', 'unified-engine/src/pixel-stats.js': 'web/engine-source/src/pixel-stats.js', 'unified-engine/src/ppocr-recognition.js': 'web/engine-source/src/ppocr-recognition.js', 'unified-engine/src/prnu-archive.js': 'web/engine-source/src/prnu-archive.js', 'unified-engine/src/prnu-hdf5-pages.js': 'web/engine-source/src/prnu-hdf5-pages.js', 'unified-engine/src/prnu-ncc.js': 'web/engine-source/src/prnu-ncc.js', 'unified-engine/src/prnu-stored-builder.js': 'web/engine-source/src/prnu-stored-builder.js', 'unified-engine/src/prnu.js': 'web/engine-source/src/prnu.js', 'unified-engine/src/research-render.js': 'web/engine-source/src/research-render.js', 'unified-engine/src/rita-analyzer.js': 'web/engine-source/src/rita-analyzer.js', 'unified-engine/src/safire-parameter-preview.js': 'web/engine-source/src/safire-parameter-preview.js', 'unified-engine/src/safire.js': 'web/engine-source/src/safire.js', 'unified-engine/src/scientific-text-detector.js': 'web/engine-source/src/scientific-text-detector.js', 'unified-engine/src/segmented-blocking.js': 'web/engine-source/src/segmented-blocking.js', 'unified-engine/src/segmented-bytes.js': 'web/engine-source/src/segmented-bytes.js', 'unified-engine/src/segmented-color-spaces.js': 'web/engine-source/src/segmented-color-spaces.js', 'unified-engine/src/segmented-comparison.js': 'web/engine-source/src/segmented-comparison.js', 'unified-engine/src/segmented-contrast.js': 'web/engine-source/src/segmented-contrast.js', 'unified-engine/src/segmented-defects.js': 'web/engine-source/src/segmented-defects.js', 'unified-engine/src/segmented-echo.js': 'web/engine-source/src/segmented-echo.js', 'unified-engine/src/segmented-illuminant.js': 'web/engine-source/src/segmented-illuminant.js', 'unified-engine/src/segmented-magnifier-large.js': 'web/engine-source/src/segmented-magnifier-large.js', 'unified-engine/src/segmented-magnifier.js': 'web/engine-source/src/segmented-magnifier.js', 'unified-engine/src/segmented-median.js': 'web/engine-source/src/segmented-median.js', 'unified-engine/src/segmented-separation.js': 'web/engine-source/src/segmented-separation.js', 'unified-engine/src/segmented-stereogram.js': 'web/engine-source/src/segmented-stereogram.js', 'unified-engine/src/separation-cache.js': 'web/engine-source/src/separation-cache.js', 'unified-engine/src/source-prefix-integrity.js': 'web/engine-source/src/source-prefix-integrity.js', 'unified-engine/src/source-read-transcript.js': 'web/engine-source/src/source-read-transcript.js', 'unified-engine/src/source-region-adjust.js': 'web/engine-source/src/source-region-adjust.js', 'unified-engine/src/source-region-geometry.js': 'web/engine-source/src/source-region-geometry.js', 'unified-engine/src/source-region-runtime.js': 'web/engine-source/src/source-region-runtime.js', 'unified-engine/src/source-region-spatial.js': 'web/engine-source/src/source-region-spatial.js', 'unified-engine/src/sparse-copy.js': 'web/engine-source/src/sparse-copy.js', 'unified-engine/src/sparse-extract.js': 'web/engine-source/src/sparse-extract.js', 'unified-engine/src/text-pixels.js': 'web/engine-source/src/text-pixels.js', 'unified-engine/src/thumbnail-analysis.js': 'web/engine-source/src/thumbnail-analysis.js', 'unified-engine/src/thumbnail-stream.js': 'web/engine-source/src/thumbnail-stream.js', 'unified-engine/src/trufor-segmented-analyzer.js': 'web/engine-source/src/trufor-segmented-analyzer.js', 'unified-engine/src/worker-client.js': 'web/engine-source/src/worker-client.js', 'unified-engine/src/worker.js': 'web/engine-source/src/worker.js', 'unified-engine/vendor/resampling-em/resampling-em.js': 'web/engine-source/vendor/resampling-em/resampling-em.js', 'unified-engine/vendor/resampling-em/resampling-em.wasm': 'web/engine-source/vendor/resampling-em/resampling-em.wasm'}
PARENT = 'web/wordpress/runtime-patches/workspace-20261020.json'
PARENT_SHA = 'd5e434fe329d15c79bb89294561243eb61ba5d90ba956a78272eb600e8bbb908'
PREFIX = 'web/wordpress/runtime-patches/baselines/web-0.24.0-review/'
WASM_SHA = 'b082475745e8e3026b1a82640536db18b3e6593edae046cb7a3bec508141ff02'
NATIVE_SOURCE = 'web/engine-source/native/resampling-em-stream.cpp'
NATIVE_SHA = '1ed1e30b88e2d730474a618e98514ca06e45f1f61e408bef576170a5d50882a3'
encode = lambda v: (json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n').encode()
digest = lambda b: hashlib.sha256(b).hexdigest()

def expected_transport(name, raw):
    if name.startswith('extension-engine/'):
        return b'import "../runtime-context.js?v=0.25.0";\n' + raw.replace(b'engine-source/', b'unified-engine/')
    if name.startswith('unified-engine/src/') and name.endswith('.js'):
        return b'import "../../runtime-context.js?v=0.25.0";\n' + raw
    if name == 'unified-engine/vendor/resampling-em/resampling-em.js':
        signature = 'async function instantiateAsync(binary,binaryFile,imports)'
        text = raw.decode()
        pattern = re.escape(signature) + r'\{.*?\}function getWasmImports\('
        match = re.search(pattern, text, re.S)
        if not match: raise ValueError('Unreviewed native transport factory')
        pin = json.dumps({'size':38571,'sha256':WASM_SHA}, separators=(',', ':'))
        replacement = signature+'{return instantiateDependency(binary,binaryFile,imports,'+pin+')}function getWasmImports('
        return ('import {instantiateDependency} from "../../../runtime-dependency.js?v=0.25.0";\n'+text[:match.start()]+replacement+text[match.end():]).encode()
    return raw

def reviewed_review_increment(root, latest_predecessor=None):
    root = Path(root); repository = root.parents[1]
    if latest_predecessor is None and (root/'runtime-patches/cumulative-20261026.json').exists():
        import importlib.util
        spec=importlib.util.spec_from_file_location('cumulative_predecessor',root/'runtime-cumulative.py')
        layer=importlib.util.module_from_spec(spec);spec.loader.exec_module(layer)
        _,latest_predecessor=layer.reviewed_cumulative_increment(root)
    path = root/'runtime-patches/review-20261021.json'
    if not path.exists(): return None, {}
    receipt = json.loads(path.read_bytes())
    if receipt.get('schema') != 'sherloq.native-review-runtime-increment/1' or receipt.get('version') != VERSION:
        raise ValueError('Unsupported native inspection increment')
    def read(name):
        if not isinstance(name,str) or PurePosixPath(name).is_absolute() or '\\' in name or any(p in ['', '.', '..'] for p in name.split('/')): raise ValueError('Unsafe native inspection path')
        return latest_predecessor[name] if latest_predecessor and name in latest_predecessor else (repository/name).read_bytes()
    def verify(ref, location=None):
        data=read(location or ref['file'])
        if digest(data)!=ref['sha256'] or len(data)!=ref['size']: raise ValueError('Native inspection metadata identity differs: '+ref['file'])
        return data
    baseline=receipt['baseline'];parent=baseline['parentReceipt']
    if parent['file']!=PARENT or parent['sha256']!=PARENT_SHA: raise ValueError('Native inspection predecessor differs')
    parent=json.loads(verify(parent));previous={}
    for ref in baseline['snapshots']:
        if ref['file'] in previous or not ref['copy'].startswith(PREFIX):raise ValueError('Invalid native inspection snapshot')
        previous[ref['file']]=verify(ref,ref['copy'])
    def predecessor(ref):
        data=previous[ref['file']]
        if digest(data)!=ref['sha256'] or len(data)!=ref['size']:raise ValueError('Native inspection predecessor identity differs')
        return json.loads(data)
    if any(baseline['manifest'][k]!=parent['manifest'][k] for k in ['file','sha256','size']):raise ValueError('Native inspection predecessor inventory differs')
    manifest=predecessor(baseline['manifest']);expected=deepcopy(manifest);locks={}
    for kind in ['source','delivered']:
        ref=baseline['locks'][kind]
        if ref!=dict(parent['locks'][kind],copy=ref['copy']):raise ValueError('Native inspection predecessor lock differs')
        locks[kind]=predecessor(ref)
        if 'uiVersion' in locks[kind]:locks[kind]['uiVersion']=VERSION
        if 'deliveryAdapter' in locks[kind]:locks[kind]['deliveryAdapter']['uiVersion']=VERSION
    records=receipt['files']
    if len(records)!=len(SOURCES) or {r['file'] for r in records}!=set(SOURCES):raise ValueError('Native inspection runtime source set differs')
    added_local=[]
    for record in records:
        name=record['file'];slot_name,relative=name.split('/',1)
        if record['source']!=SOURCES[name] or record['asset']!='web/wordpress/sherloq-browser/assets/'+name or record['mirror']!='web/runtime-sources/'+name:raise ValueError('Native inspection source location differs')
        raw=read(record['source']);data=read(record['asset']);after=record['after']
        if digest(raw)!=record['sourceAfter']['sha256'] or len(raw)!=record['sourceAfter']['size'] or digest(data)!=after['sha256'] or len(data)!=after['size'] or read(record['mirror'])!=data:raise ValueError('Native inspection runtime source identity differs: '+name)
        if not 0<len(data)<512000 or after['chunks']!=[after['sha256']]:raise ValueError('Invalid native inspection resource descriptor')
        if name.endswith('.wasm') and (name!='unified-engine/vendor/resampling-em/resampling-em.wasm' or digest(raw)!=WASM_SHA or len(raw)!=38571):raise ValueError('Unreviewed native inspection binary')
        if data!=expected_transport(name,raw):raise ValueError('Native inspection transport differs')
        if record['before']!=manifest['files'].get(name) or record['added']!=(name not in manifest['files']):raise ValueError('Native inspection prior resource differs')
        expected['files'][name]=after;expected['chunks'][after['sha256']]=len(data)
        if name not in expected['localFiles']:expected['localFiles'].append(name);added_local.append(name)
        for kind in locks:
            slot=next(x for x in locks[kind]['runtimes'] if x['destination']=='sherloq-browser/assets/'+slot_name)
            if slot['files'].get(relative)!=record['sourceBeforeSha256' if kind=='source' else 'deliveredBeforeSha256']:raise ValueError('Native inspection prior runtime lock differs')
            slot['files'][relative]=record['sourceAfter']['sha256'] if kind=='source' else after['sha256']
    native=receipt['nativeSource']
    if native['file']!=NATIVE_SOURCE or native['sha256']!=NATIVE_SHA:raise ValueError('Native inspection C++ source differs')
    verify(native)
    if receipt['manifest']['addedLocalFiles']!=added_local or encode(expected)!=verify(receipt['manifest']):raise ValueError('Native inspection changes undeclared dependency metadata')
    for kind in locks:
        if receipt['locks'][kind]['file']!=baseline['locks'][kind]['file'] or encode(locks[kind])!=verify(receipt['locks'][kind]):raise ValueError('Native inspection changes undeclared runtime locks')
    return receipt,{**(latest_predecessor or {}),**previous}
