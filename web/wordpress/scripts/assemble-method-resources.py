#!/usr/bin/env python3
"""Reconstruct reviewed public slots and overlay the qualified method resources.

Run before prepare-distribution.py. Inputs are explicit directories; no network,
model calculation, site modification or private installer is involved. Restricted
graphs are verified only to describe user-importable standard files. Their bytes
are never copied to the public staging tree. Single-chunk baseline files use hard
links where possible; every replacement uses a new inode and atomic rename.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile

WINDOW = 1024 * 1024
CHUNK = 100_000_000
FOREST_INPUT = {'bytes': 5065, 'sha256': '62ce0d714bd265962a1964c5ba345463b90eb9e23c66f1772cb1969908c06988'}
BUNDLE_INPUT = {'bytes': 1824, 'sha256': 'b446e758115af4c71080e06573e66cdae7e0f3853cf7bd403eaf3bea1e64ed79'}
FOREST_COMMIT = '66bb26eca0c7e95c76042d5bcca58f744d70a27d'
MODIFIED_DATE = '2026-10-12'


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def relative(name):
    path = PurePosixPath(name)
    if not isinstance(name, str) or not name or path.is_absolute() or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')):
        raise ValueError('Unsafe resource path: ' + str(name))
    return Path(*path.parts)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(WINDOW), b''):
            digest.update(block)
    return digest.hexdigest()


def verify(path, spec, label):
    if not path.is_file() or path.stat().st_size != spec.get('bytes', spec.get('size')) or sha(path) != spec['sha256']:
        raise ValueError('Resource identity differs: ' + label)


def atomic_bytes(target, data):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + target.name + '-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_copy(source, target, hardlink=False):
    """Never write through an inode that may be an immutable chunk's hard link."""
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + target.name + '-', dir=target.parent)
    os.close(fd)
    try:
        if hardlink:
            os.unlink(temporary)
            try:
                os.link(source, temporary)
            except OSError:
                shutil.copyfile(source, temporary)
                hardlink = False
        else:
            shutil.copyfile(source, temporary)
        os.replace(temporary, target)
        return hardlink
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def identities(source_root):
    engine = source_root / 'web/engine-source'
    program = 'import {SEGMENTATION_MODELS} from ' + json.dumps((engine / 'experiments/segmentation/models.js').as_uri())
    program += ';import {EFFICIENT_LOFTR_ASSET} from ' + json.dumps((engine / 'src/efficient-loftr-assets.js').as_uri())
    program += ';import {SELFDM_PROPOSAL_MODELS,SELFDM_PROPOSAL_CV,SELFDM_PROPOSAL_PREPARE} from ' + json.dumps((engine / 'src/selfdm-proposal-assets.js').as_uri())
    program += ';process.stdout.write(JSON.stringify({selfdm:SEGMENTATION_MODELS["selfdm-map"],proposal:SEGMENTATION_MODELS["selfdm-proposal"],models:SELFDM_PROPOSAL_MODELS,cv:SELFDM_PROPOSAL_CV,prepare:SELFDM_PROPOSAL_PREPARE,eloftr:EFFICIENT_LOFTR_ASSET}));'
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', program], text=True))


def assemble(args):
    source_root = args.source_root.resolve()
    wordpress = source_root / 'web/wordpress'
    assets = wordpress / 'sherloq-browser/assets'
    research = args.research_root.resolve()
    base = json.loads(args.base_manifest.read_text())
    if base.get('schema') != 'sherloq.dependencies/1':
        raise ValueError('Expected the reviewed standard dependency manifest')
    lock = json.loads((wordpress / 'runtime-lock.json').read_text())
    slots = [str(Path(runtime['destination']).relative_to('sherloq-browser/assets')) for runtime in lock['runtimes']]
    if slots != base['slots']:
        raise ValueError('Baseline slot list differs from the reviewed runtime lock')
    # Select source BEFORE the first output mutation. Neither a baseline
    # selector nor a copied source selector may reactivate an older bundle.
    engine = source_root / 'web/engine-source'
    worker_builder = engine / 'scripts/build-engine-worker.mjs'
    selector_relative = 'unified-engine/src/engine-worker-entry.js'
    selector_output = assets / selector_relative
    has_selector = selector_output.exists() or (engine / 'src/engine-worker-entry.js').exists() or selector_relative in base['files']
    reset_selector = has_selector or args.worker_bundle
    if reset_selector:
        if not worker_builder.is_file():
            raise FileNotFoundError('Worker selector requires its complete reconstruction script')
        subprocess.run([args.node, str(worker_builder), '--source-only=' + str(assets / 'unified-engine')], check=True)

    receipt = {'schema': 'sherloq.method-resource-assembly/1', 'baseManifestSha256': sha(args.base_manifest),
               'baselineFiles': 0, 'baselineBytes': 0, 'baselineHardlinks': 0, 'baselineCopiedBytes': 0,
               'verifiedChunks': 0, 'overlayFiles': 0, 'overlayBytes': 0, 'publicMethodFiles': [],
               'localOnlyFiles': [], 'published': False}
    verified = set()
    for name, spec in sorted(base['files'].items()):
        relative(name)
        if spec.get('localOnly'):
            continue
        if reset_selector and name == selector_relative:
            receipt['baselineWorkerSelectorBypassed'] = True
            continue
        slot, _, rest = name.partition('/')
        if slot not in slots or not rest:
            raise ValueError('Dependency outside a locked standard slot: ' + name)
        target = assets / relative(name)
        parts = []
        for digest in spec['chunks']:
            if not re.fullmatch('[a-f0-9]{64}', digest):
                raise ValueError('Invalid immutable chunk hash')
            chunk = args.base_chunks / (digest + '.bin')
            if digest not in verified:
                verify(chunk, {'bytes': base['chunks'][digest], 'sha256': digest}, 'chunk/' + digest)
                verified.add(digest)
            parts.append(chunk)
        if sum(part.stat().st_size for part in parts) != spec['size']:
            raise ValueError('Baseline chunk boundaries differ: ' + name)
        if len(parts) == 1 and spec['sha256'] == spec['chunks'][0]:
            if atomic_copy(parts[0], target, hardlink=True):
                receipt['baselineHardlinks'] += 1
            else:
                receipt['baselineCopiedBytes'] += spec['size']
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix='.' + target.name + '-', dir=target.parent)
            digest = hashlib.sha256()
            try:
                with os.fdopen(fd, 'wb') as stream:
                    for part in parts:
                        with part.open('rb') as source:
                            for block in iter(lambda: source.read(WINDOW), b''):
                                digest.update(block)
                                stream.write(block)
                if digest.hexdigest() != spec['sha256']:
                    raise ValueError('Reconstructed baseline identity differs: ' + name)
                os.replace(temporary, target)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            receipt['baselineCopiedBytes'] += spec['size']
        receipt['baselineFiles'] += 1
        receipt['baselineBytes'] += spec['size']
    receipt['verifiedChunks'] = len(verified)
    print(json.dumps({'phase': 'baseline-restored', 'files': receipt['baselineFiles'], 'bytes': receipt['baselineBytes'],
                      'hardlinks': receipt['baselineHardlinks'], 'copiedBytes': receipt['baselineCopiedBytes']}), flush=True)

    # Only Git-tracked executable/runtime sources are admitted. A developer's
    # untracked build.json, private paths or live model directories cannot enter.
    tracked = subprocess.check_output([args.git, '-C', str(source_root), 'ls-files', '-z', '--',
                                      'web/engine-source/src', 'web/engine-source/vendor', 'web/engine-source/experiments', 'web/engine-source/package.json'], text=True).split('\0')
    engine = source_root / 'web/engine-source'
    admitted_extensions = {'.js', '.mjs', '.json', '.wasm', '.d.ts'}
    for name in sorted(name for name in tracked if name):
        source = source_root / relative(name)
        if source.suffix not in admitted_extensions and not source.name.endswith('.d.ts') and not any(word in source.name.lower() for word in ('license', 'notice', 'copying', 'copyright')):
            continue
        destination = 'unified-engine/' + source.relative_to(engine).as_posix()
        if not source.is_file():
            if args.fallback and (args.fallback / destination).is_file():
                source = args.fallback / destination
            else:
                raise FileNotFoundError('Tracked runtime source missing: ' + name)
        # Existing native arrays/weights/runtime slots stay unchanged. The copy
        # breaks the chunk hard link before replacing any reviewed source bytes.
        if reset_selector and destination == selector_relative:
            receipt['sourceWorkerSelectorRetained'] = True
            continue
        atomic_copy(source, assets / relative(destination))
        receipt['overlayFiles'] += 1
        receipt['overlayBytes'] += source.stat().st_size
    for name in ('CONTRACT.md', 'LICENSE', 'NOTICE.md'):
        source = engine / name
        if source.is_file():
            atomic_copy(source, assets / 'unified-engine' / name)

    expected = identities(source_root)
    proposal = research / 'selfdm-ssg/proposal-browser-candidate/integration-bundle-sp-window'
    bundle_path = proposal / 'selfdm-proposal-bundle.json'
    verify(bundle_path, BUNDLE_INPUT, 'qualified SelfDM proposal bundle')
    if any(expected['proposal'][key] != BUNDLE_INPUT[key] for key in ('bytes', 'sha256')):
        raise ValueError('Executable SelfDM bundle identity differs from qualified input')
    bundle = json.loads(bundle_path.read_text())
    if bundle.get('schema') != 1 or bundle.get('family') != 'selfdm-proposal':
        raise ValueError('SelfDM proposal bundle schema')
    policy = {'schema': 'sherloq.resource-policy/1', 'files': {}}

    def public_file(source, destination, spec=None):
        if spec:
            verify(source, spec, destination)
        target = assets / relative(destination)
        atomic_copy(source, target, hardlink=True)
        record = {'path': destination, 'bytes': target.stat().st_size, 'sha256': sha(target)}
        receipt['publicMethodFiles'].append(record)
        return record

    def restricted_file(source, destination, spec):
        verify(source, spec, destination)
        target = assets / relative(destination)
        if target.exists():
            raise ValueError('Restricted graph is already materialized; use a clean public assembly: ' + destination)
        chunks = []
        with source.open('rb') as stream:
            while data := stream.read(CHUNK):
                chunks.append({'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        policy['files'][destination] = {'localOnly': True, 'sha256': spec['sha256'], 'bytes': spec['bytes'], 'chunks': chunks}
        receipt['localOnlyFiles'].append(destination)

    prefix = 'individual-assets/segmentation/selfdm-proposal/'
    public_file(bundle_path, prefix + bundle_path.name, BUNDLE_INPUT)
    for name, identity in expected['models'].items():
        component = bundle['models'][name]
        if any(component[key] != identity[key] for key in ('bytes', 'sha256', 'file')):
            raise ValueError('SelfDM component identity differs: ' + name)
        source = proposal / relative(component['file'])
        if name in ('selfdm', 'superpoint', 'superpoint-post', 'superglue'):
            restricted_file(source, prefix + component['file'], component)
        else:
            public_file(source, prefix + component['file'], component)
    for name in ('cv', 'prepare', 'cvFactory'):
        component = bundle[name]
        if name in expected and any(expected[name][key] != component[key] for key in ('bytes', 'sha256')):
            raise ValueError('SelfDM supporting runtime identity differs: ' + name)
        public_file(proposal / relative(component['file']), prefix + component['file'], component)

    efficient = research / 'aliked-eloftr/export/efficient-loftr-full-fp32.onnx'
    public_file(efficient, 'individual-assets/m3/' + efficient.name, expected['eloftr'])
    forest_dir = research / 'ssg/full-candidate'
    forest_path = forest_dir / 'forest-manifest.json'
    verify(forest_path, FOREST_INPUT, 'qualified original SSG forest manifest')
    forest = json.loads(forest_path.read_text())
    if forest.get('schema') != 'sherloq.ssg-structured-forest/1' or forest.get('sourceCommit') != FOREST_COMMIT:
        raise ValueError('Original structured-forest source identity differs')
    ssg_prefix = 'individual-assets/m3/ssg/'
    for component in forest['arrays']:
        public_file(forest_dir / relative(component['file']), ssg_prefix + component['file'], component)
    for name, component in forest['runtime'].items():
        public_file(forest_dir / relative(name), ssg_prefix + name, component)
    forest.pop('privateOnly', None)
    forest['license'] = 'MSR-LA (structured forest and derived detector runtimes), noncommercial purposes only; BSD-2-Clause (Piotr channel code). The independent project adapters have their separately stated license.'
    forest['nonCommercialOnly'] = True
    forest['original']['file'] = 'Function/EDGE/model.mat'
    forest['licenses'] = ['LICENSE-MSR-LA.txt', 'LICENSE-Piotr-BSD-2-Clause.txt', 'NOTICE-MODIFICATIONS.txt']
    forest['modificationDate'] = MODIFIED_DATE
    forest['modifications'] = 'Lossless MAT-to-standard-NPY storage; Emscripten scalar/SIMD and shared-worker runtime adaptation; native x86 reciprocal instruction lookup retained to match original channel and tree decisions. Original forest parameters and array bytes are unchanged. Independent localization and geometry do not redistribute the original MATLAB or RANSAC toolbox.'
    public_manifest = encode(forest)
    atomic_bytes(assets / ssg_prefix / 'forest-manifest.json', public_manifest)
    forest_identity = {'url': '../' + ssg_prefix + 'forest-manifest.json', 'bytes': len(public_manifest), 'sha256': hashlib.sha256(public_manifest).hexdigest()}

    def notice(source, destination, expected_sha=None):
        if expected_sha and sha(source) != expected_sha:
            raise ValueError('License notice differs: ' + destination)
        public_file(source, destination)

    notice(research / 'ssg/official-source/Function/EDGE/license.txt', ssg_prefix + 'LICENSE-MSR-LA.txt', 'f1886f68e3dec9708f27c3fa2731bb5c7310977b389de76ac1f7cf31242f800c')
    notice(research / 'ssg/official-source/Function/EDGE/toolbox/external/bsd.txt', ssg_prefix + 'LICENSE-Piotr-BSD-2-Clause.txt')
    atomic_bytes(assets / ssg_prefix / 'NOTICE-MODIFICATIONS.txt', (
        'SSG structured forest / Piotr Dollar structured edge detector\n'
        'Noncommercial redistribution under the attached MSR-LA terms.\n'
        'The attached Piotr BSD notice applies to channel implementations.\n'
        'This separable dependency is not relicensed under the application license.\n'
        'Modified for browser delivery on ' + MODIFIED_DATE + '.\n' + forest['modifications'] + '\n'
        'Source: https://github.com/ChaoWang1016/word2phraseCMFD/tree/' + FOREST_COMMIT + '/Function/EDGE\n'
    ).encode())
    notice(engine / 'vendor/ssg-vlfeat/LICENSE.txt', ssg_prefix + 'LICENSE-VLFeat-BSD-2-Clause.txt', '33b9f7703327199088d74f884b19997a0084180f984724720095a7cb412c4d89')
    notice(engine / 'vendor/pocketfft/LICENSE.md', ssg_prefix + 'LICENSE-pocketfft-BSD-3-Clause.txt', 'a85ca13fdf90160b64a0698215868c13b74d835ad0a4e2ba44713b8c5058a056')
    notice(research / 'selfdm-ssg/SelfDM-TIP/deepmask/LICENSE', prefix + 'LICENSE-DeepMask-MIT.txt', '06a9e0a7d52dd7fc23a935054c3f3f25cde3cfc566a4873fdc9c46035d65db98')
    notice(research / 'selfdm-ssg/ConvCRF-LICENSE', prefix + 'LICENSE-ConvCRF-MIT.txt', '458d8a7bcb0dcd0a98aa7aae41571288daa5a4287d90accda3f5014d2dfc7e4e')
    notice(engine / 'vendor/selfdm-proposal/LICENSE-OPENCV.txt', prefix + 'LICENSE-OpenCV-Apache-2.0.txt', 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30')
    notice(research / 'aliked-eloftr/licenses/EfficientLoFTR-Apache-2.0.txt', 'individual-assets/m3/LICENSE-EfficientLoFTR-Apache-2.0.txt', 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4')
    atomic_bytes(assets / prefix / 'NOTICE-MODIFICATIONS.txt', (
        'SelfDM Proposal SuperGlue support components; browser conversion ' + MODIFIED_DATE + '.\n'
        'DeepMask (Qiang Wang): MIT project code and author-linked trained weights.\n'
        'ConvCRF (Marvin Teichmann): MIT; static Float32 graph has no learned weights.\n'
        'OpenCV SEEDS: Apache-2.0 with independently written original-grid wrappers.\n'
        'The complete chain is not MIT: SelfDM/SuperPoint/SuperGlue graphs remain user-supplied research material and are not hosted by this distribution.\n'
    ).encode())
    atomic_bytes(assets / 'individual-assets/m3/NOTICE-EfficientLoFTR.txt', (
        'EfficientLoFTR CVPR2024; Apache-2.0 source pinned to ffd4a4644064354468eb1f0c7a3e732233cb732f.\n'
        'Modified ' + MODIFIED_DATE + ': complete native FP32 checkpoint exported to standard ONNX with axis-separated RoPE constants; scientific values unchanged.\n'
        'Checkpoint SHA256: 0af6291141c736e75e94b7f8aae4399b77c7731b3f08758212b2cfe370188878.\n'
    ).encode())

    models_path = assets / 'individual-assets/individual-models.json'
    models = json.loads(models_path.read_text())
    for name, identity in [('selfdm-map', expected['selfdm']), ('selfdm-proposal', expected['proposal'])]:
        filename = 'selfdm-map-512.onnx' if name == 'selfdm-map' else 'selfdm-proposal-bundle.json'
        models['segmentation'][name] = {'variant': name, 'bytes': identity['bytes'], 'sha256': identity['sha256'],
                                        'url': '../' + prefix + filename, 'availability': 'local-model-required'}
    models['m3']['eloftr'] = {key: expected['eloftr'][key] for key in ('bytes', 'sha256')}
    models['m3']['eloftr']['url'] = '../individual-assets/m3/efficient-loftr-full-fp32.onnx'
    models['m3']['ssg-edges'] = forest_identity
    atomic_bytes(models_path, encode(models))
    atomic_bytes(args.policy_output, encode(policy))
    receipt['ssgManifest'] = {key: forest_identity[key] for key in ('bytes', 'sha256')}
    receipt['selfdmBundle'] = BUNDLE_INPUT

    if args.worker_bundle:
        if not worker_builder.is_file():
            raise FileNotFoundError('Worker bundler source is missing')
        command = [args.node, str(worker_builder), '--engine-root=' + str(engine), '--ui-root=' + str(assets),
                   '--output-root=' + str(assets / 'unified-engine'), '--dependencies-root=' + str(engine)]
        subprocess.run(command, check=True)
        subprocess.run(command + ['--check'], check=True)
        receipt['workerPackaging'] = 'fresh-generated-entry; complete source Worker retained'

    # Source lock means precisely the inputs reviewed before the transport
    # adapter. Unchanged slots are the already published baseline byte streams;
    # only unified-engine and individual-assets have new raw source additions.
    for runtime in lock['runtimes']:
        destination = wordpress / relative(runtime['destination'])
        actual = {p.relative_to(destination).as_posix(): sha(p) for p in sorted(destination.rglob('*')) if p.is_file() and p.name != '.DS_Store'}
        runtime['files'] = actual
        if destination.name == 'unified-engine':
            runtime['version'] = '0.37.0-methods.1'
            runtime['engineCommit'] = subprocess.check_output([args.git, '-C', str(source_root), 'rev-parse', 'HEAD'], text=True).strip()
            runtime['sourceIncrement'] = {'kind': 'tracked-runtime-source-overlay', 'sha256': hashlib.sha256(encode(actual)).hexdigest()}
        elif destination.name == 'individual-assets':
            runtime['version'] = 'individual-tools-methods-20261012'
    lock['status'] = 'reviewed-method-resource-inputs'
    lock['notes'] = 'Physical public inputs verified before transport adaptation. Unchanged slots retain published baseline bytes. Optional local-only graphs are metadata-only in the separate resource policy; they are never staged or copied here.'
    lock.pop('deliveryAdapter', None)
    atomic_bytes(wordpress / 'runtime-source-lock.json', encode(lock))
    atomic_bytes(wordpress / 'runtime-lock.json', encode(lock))
    receipt['runtimeInputLockSha256'] = hashlib.sha256(encode(lock)).hexdigest()
    receipt['runtimeFiles'] = sum(len(runtime['files']) for runtime in lock['runtimes'])
    atomic_bytes(args.receipt_output, encode(receipt))
    print(json.dumps({key: receipt[key] for key in ('baselineFiles', 'baselineBytes', 'baselineHardlinks', 'baselineCopiedBytes', 'overlayFiles', 'overlayBytes', 'runtimeFiles', 'localOnlyFiles', 'ssgManifest', 'runtimeInputLockSha256')}), flush=True)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research-root', required=True, type=Path, help='Downloaded standard method research resources')
    parser.add_argument('--base-manifest', required=True, type=Path, help='Exact published manifest-template.json')
    parser.add_argument('--base-chunks', required=True, type=Path, help='Read-only immutable SHA256 chunk directory')
    parser.add_argument('--source-root', required=True, type=Path, help='Reviewed Git repository checkout')
    parser.add_argument('--fallback', type=Path, help='Optional qualified runtime assets if tracked binaries are absent')
    parser.add_argument('--node', default='node', help='Node.js for local deterministic Worker packaging')
    parser.add_argument('--worker-bundle', action='store_true', help='Build the pinned optional Worker bundle after all runtime source copies')
    parser.add_argument('--git', default='git', help='Git executable; never changes repository state')
    parser.add_argument('--policy-output', required=True, type=Path, help='Metadata-only local graph policy for prepare-distribution --resource-policy')
    parser.add_argument('--receipt-output', required=True, type=Path, help='Small private reproducibility receipt')
    assemble(parser.parse_args())
