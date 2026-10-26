"""Verify the workspace-control layer against the published RITA delivery."""
from pathlib import Path, PurePosixPath
from copy import deepcopy
import hashlib
import json

CORE = frozenset(['src/automatic-runtime.js', 'src/batch-preparation-host.js', 'src/d2prl-adapter.js', 'src/index.d.ts', 'src/index.js', 'src/jpeg-source-evidence.js', 'src/m2-native-source-client.js', 'src/m2-source-region-input.js', 'src/m2-worker-client.js', 'src/m2-worker-host.js', 'src/native-source-channel.js', 'src/noisesniffer-paged-selection.js', 'src/noisesniffer-preview.js', 'src/noisesniffer-selection-basis.js', 'src/ocr-analyzer.js', 'src/ocr-structure.js', 'src/ppocr-analyzer.js', 'src/ppocr-recognition.js', 'src/read-cooperation.js', 'src/resampling-gray-source.js', 'src/rgb-surface.js', 'src/segmentation-adapter.js', 'src/segmented-blocking.js', 'src/segmented-dft.js', 'src/segmented-ela-biomes.js', 'src/segmented-energy.js', 'src/segmented-frequency.js', 'src/segmented-noisesniffer-selection.js', 'src/segmented-noisesniffer.js', 'src/segmented-resampling.js', 'src/source-region-adjust.js', 'src/source-region-capabilities.js', 'src/source-region-dispatch.js', 'src/source-region-ela.js', 'src/source-region-geometry.js', 'src/source-region-gray.js', 'src/source-region-histogram.js', 'src/source-region-localize.js', 'src/source-region-neural-localize.js', 'src/source-region-plots.js', 'src/source-region-raw-result.js', 'src/source-region-record.js', 'src/source-region-runtime.js', 'src/source-region-spatial.js', 'src/source-region-transport.js', 'src/source-region-view.js', 'src/tesseract-ocr-worker.js', 'src/tesseract-ocr.js', 'src/worker-client.js', 'src/worker.js'])
OCR_RESOURCES = {'ocr-assets/ppocrv6-medium/det/inference.onnx': {'sha256': 'eb13b44b25bb36f89528b68720af8a61d9cf381176107f465db1757b65d086e1', 'size': 62032837}, 'ocr-assets/ppocrv6-medium/det/inference.json': {'sha256': '0f1a7ec35da36173529c7a60238b7f7919e3831929c3f700ad90ad4896adecd5', 'size': 312150}, 'ocr-assets/ppocrv6-medium/det/inference.yml': {'sha256': '7298d5ead546584af2504d03355f881ac7a7bc0eb1e282d3e159277c1d0af871', 'size': 886}, 'ocr-assets/ppocrv6-medium/det/README.md': {'sha256': '3046e3aab0194a2291bb3941c93b980c2b3a938a24a5be88354968f6d6187ac8', 'size': 16089}, 'ocr-assets/ppocrv6-medium/rec/inference.onnx': {'sha256': '9c09abf0957f7968c7586464b7397b84ad2387a0497a351af40e9acc71b673ba', 'size': 76554979}, 'ocr-assets/ppocrv6-medium/rec/inference.json': {'sha256': '0b2e25e990bd072f1bf77d59d67d508bce6c4bd44af6624e0fb27d6da2cd00e8', 'size': 221814}, 'ocr-assets/ppocrv6-medium/rec/inference.yml': {'sha256': '991b700facf5b50a7de193468207d5f4255b538dde0d312ae3b7c7a9b6873129', 'size': 150580}, 'ocr-assets/ppocrv6-medium/rec/README.md': {'sha256': 'ebce8d28436623ecab4952e24935aed86b3f8ecaf8f8736b92d5544f60fae1e9', 'size': 16587}, 'ocr-assets/tessdata-best/eng.traineddata': {'sha256': '8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba', 'size': 15400601}, 'ocr-assets/tessdata-best/fra.traineddata': {'sha256': '907743d98915c91a3906dfbf6e48b97598346698fe53aaa797e1a064ffcac913', 'size': 3972885}, 'ocr-assets/ppocrv6-medium/LICENSE': {'sha256': '3840c5c0c61c294264d2dd77b8777be6ddd90121ef4e0e64abcd22edea581d6e', 'size': 11376}, 'ocr-assets/tessdata-best/LICENSE': {'sha256': 'a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9', 'size': 10173}, 'ocr-assets/ppocrv6-medium/rec/dictionary.json': {'sha256': '679f4f4cbbb4f762e84fae998e02c08a556afbd115968104ca3b4aeee5cb2b19', 'size': 112366}, 'ocr-assets/pp-lcnet-line-orientation/inference.onnx': {'sha256': '38aa97cd4be591e0ad304e659f07ba30d946f27a63315433f6659c69c8778345', 'size': 6777816}, 'ocr-assets/pp-lcnet-line-orientation/inference.yml': {'sha256': '8d5120d0e1a30a9df7ed46aa9119da3796ed066777089d1c1d705f132d5e90f9', 'size': 735}, 'ocr-assets/pp-lcnet-line-orientation/README.md': {'sha256': 'ab6aae4b15f5abec133fb8f9dad83d60be17341653acba498acbecbca89ee916', 'size': 1738}, 'ocr-assets/manifest.json': {'sha256': '38d5b39fb317221d9b5e72ab6587eaebd14894f6be486b3d1636e3df7c1c3a12', 'size': 1422}}
PARENT = 'web/wordpress/runtime-patches/interactive-20261020.json'
PARENT_SHA = '9cac3b17c8e7714d62c64eadbaa464b9051e815b8db800bef449a463727af212'
PNG_SHA = '8630cb9c926c1c7b74c53a00e10237f5adfb4a00153597421130d0c961584590'
PREFIX = 'web/wordpress/runtime-patches/baselines/web-0.23.0-workspace/'
encode = lambda x: (json.dumps(x, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
digest = lambda x: hashlib.sha256(x).hexdigest()


def reviewed_workspace_increment(root, latest_predecessor=None):
    root = Path(root)
    repository = root.parents[1]
    if latest_predecessor is None and (root/'runtime-patches/review-20261021.json').exists():
        import importlib.util
        spec=importlib.util.spec_from_file_location('review_predecessor',root/'runtime-review.py')
        layer=importlib.util.module_from_spec(spec);spec.loader.exec_module(layer)
        _,latest_predecessor=layer.reviewed_review_increment(root)
    path = root / 'runtime-patches/workspace-20261020.json'
    if not path.exists():
        return None, {}
    receipt = json.loads(path.read_bytes())
    if receipt.get('schema') != 'sherloq.workspace-runtime-increment/1' or receipt.get('version') != '0.24.0':
        raise ValueError('Unsupported workspace runtime increment')

    def read(name):
        if not isinstance(name, str) or PurePosixPath(name).is_absolute() or '\\' in name or any(p in ['', '.', '..'] for p in name.split('/')):
            raise ValueError('Unsafe workspace source path')
        return latest_predecessor[name] if latest_predecessor and name in latest_predecessor else (repository / name).read_bytes()

    def verify(ref, location=None):
        data = read(location or ref['file'])
        if digest(data) != ref['sha256'] or len(data) != ref['size']:
            raise ValueError('Workspace metadata identity differs: ' + ref['file'])
        return data

    baseline = receipt['baseline']
    parent = baseline['parentReceipt']
    if parent['file'] != PARENT or parent['sha256'] != PARENT_SHA:
        raise ValueError('Workspace predecessor differs')
    parent = json.loads(verify(parent))
    previous = {}
    for ref in baseline['snapshots']:
        if ref['file'] in previous or not ref['copy'].startswith(PREFIX):
            raise ValueError('Invalid workspace predecessor snapshot')
        previous[ref['file']] = verify(ref, ref['copy'])

    def predecessor(ref):
        data = previous[ref['file']]
        if digest(data) != ref['sha256'] or len(data) != ref['size']:
            raise ValueError('Workspace predecessor identity differs')
        return json.loads(data)

    if baseline['manifest']['file'] != parent['manifest']['file'] or baseline['manifest']['sha256'] != parent['manifest']['sha256']:
        raise ValueError('Workspace predecessor inventory differs')
    manifest = predecessor(baseline['manifest'])
    expected = deepcopy(manifest)
    locks = {}
    for kind in ['source', 'delivered']:
        ref = baseline['locks'][kind]
        if ref['file'] != parent['locks'][kind]['file'] or ref['sha256'] != parent['locks'][kind]['sha256']:
            raise ValueError('Workspace predecessor lock differs')
        locks[kind] = predecessor(ref)
        if 'uiVersion' in locks[kind]:
            locks[kind]['uiVersion'] = receipt['version']
        if 'deliveryAdapter' in locks[kind]:
            locks[kind]['deliveryAdapter']['uiVersion'] = receipt['version']
    records = receipt['files']
    if len(records) != len(CORE) or {r['file'] for r in records} != {'unified-engine/' + n for n in CORE}:
        raise ValueError('Workspace runtime source set differs')
    added_local = []
    for record in records:
        name = record['file']
        rel = name.removeprefix('unified-engine/')
        if (record['source'], record['asset'], record['mirror']) != ('web/engine-source/' + rel, 'web/wordpress/sherloq-browser/assets/' + name, 'web/runtime-sources/' + name):
            raise ValueError('Workspace runtime source location differs')
        raw, data = read(record['source']), read(record['asset'])
        after = record['after']
        if len(raw) != record['sourceAfter']['size'] or digest(raw) != record['sourceAfter']['sha256'] or len(data) != after['size'] or digest(data) != after['sha256'] or read(record['mirror']) != data:
            raise ValueError('Workspace runtime source identity differs: ' + name)
        if not 0 < len(data) < 512_000 or after['chunks'] != [after['sha256']]:
            raise ValueError('Invalid workspace resource descriptor')
        if rel.endswith('.wasm') and (digest(data) != PNG_SHA or data != raw):
            raise ValueError('Unreviewed workspace native binary')
        if rel.endswith('.js') and data != b'import "../../runtime-context.js?v=0.24.0";\n' + raw:
            raise ValueError('Workspace source transport differs')
        if record['before'] != manifest['files'].get(name) or record['added'] != (name not in manifest['files']):
            raise ValueError('Workspace predecessor descriptor differs')
        expected['files'][name] = after
        expected['chunks'][after['sha256']] = len(data)
        if name not in expected['localFiles']:
            expected['localFiles'].append(name)
            added_local.append(name)
        for kind in locks:
            slot = next(x for x in locks[kind]['runtimes'] if x['destination'] == 'sherloq-browser/assets/unified-engine')
            if slot['files'].get(rel) != record['sourceBeforeSha256' if kind == 'source' else 'deliveredBeforeSha256']:
                raise ValueError('Workspace predecessor runtime lock differs')
            slot['files'][rel] = record['sourceAfter']['sha256'] if kind == 'source' else after['sha256']
    resources = receipt.get('resources', [])
    if len(resources) != 17 or len({r['file'] for r in resources}) != 17 or receipt.get('resourceSlot') != 'ocr-assets' or 'ocr-assets' in expected['slots']:
        raise ValueError('Unexpected OCR resource set')
    if {r['file']:{'sha256':r['after']['sha256'],'size':r['after']['size']} for r in resources} != OCR_RESOURCES:
        raise ValueError('Unreviewed OCR model identity')
    expected['slots'].append('ocr-assets')
    ocr_files = {}
    for record in resources:
        name, after = record['file'], record['after']
        if not name.startswith('ocr-assets/') or name in expected['files'] or record['before'] is not None or after.get('localOnly') or not 0 < after['size'] <= 100_000_000 or after['chunks'] != [after['sha256']]:
            raise ValueError('Unexpected OCR resource descriptor')
        read_path = name.removeprefix('ocr-assets/')
        if PurePosixPath(read_path).is_absolute() or any(p in ['', '.', '..'] for p in read_path.split('/')) or '\\' in read_path:
            raise ValueError('Unsafe OCR resource path')
        expected['files'][name] = after
        expected['chunks'][after['sha256']] = after['size']
        ocr_files[read_path] = after['sha256']
    for lock in locks.values():
        lock['runtimes'].append({'destination':'sherloq-browser/assets/ocr-assets','version':'ppocrv6-medium-tessdata-best','files':ocr_files})
    if receipt['manifest']['addedLocalFiles'] != added_local or encode(expected) != verify(receipt['manifest']):
        raise ValueError('Workspace changes undeclared dependency metadata')
    for kind in locks:
        if receipt['locks'][kind]['file'] != baseline['locks'][kind]['file'] or encode(locks[kind]) != verify(receipt['locks'][kind]):
            raise ValueError('Workspace changes undeclared runtime locks')
    return receipt, {**(latest_predecessor or {}), **previous}
