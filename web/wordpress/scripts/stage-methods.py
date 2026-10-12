#!/usr/bin/env python3
"""Stage a local research build, keeping deployed assets and large weights intact."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path


def stage(fallback, resources, output, version):
    wordpress = Path(__file__).resolve().parents[1]
    engine = wordpress.parent / 'engine-source'
    spec = importlib.util.spec_from_file_location('delivery', wordpress / 'runtime-delivery.py')
    delivery = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(delivery)
    source_assets = wordpress / 'sherloq-browser/assets'

    def lookup(relative):
        path = Path(relative)
        candidates = [engine.joinpath(*path.parts[1:]), source_assets / path, fallback / path]
        for candidate in candidates:
            if candidate.is_file():
                return candidate.read_bytes()
        raise FileNotFoundError(relative)

    hashes = {}
    def write(relative, data):
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.staging')
        temporary.write_bytes(data)
        temporary.replace(target)
        hashes[relative] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

    for path in sorted(engine.rglob('*.wasm')):
        if not path.is_file():
            continue
        relative = 'unified-engine/' + path.relative_to(engine).as_posix()
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        previous = fallback / relative
        if not previous.is_file() or hashlib.sha256(previous.read_bytes()).hexdigest() != digest:
            # Ship exactly the byte stream hashed by the transport adapter. An
            # older fallback binary must never satisfy a new generated loader.
            write(relative, data)
        else:
            staged = output / relative
            if staged.is_file() or staged.is_symlink():
                staged.unlink()
            hashes[relative] = {'bytes': len(data), 'sha256': digest, 'storage': 'qualified-fallback'}
    for directory in ('src', 'vendor', 'experiments'):
        for path in sorted((engine / directory).rglob('*')):
            if path.is_file() and path.suffix in ('.js', '.mjs', '.json'):
                relative = 'unified-engine/' + path.relative_to(engine).as_posix()
                write(relative, delivery.adapted_runtime(relative, path.read_bytes(), lookup, version))
    # Keep the shared, qualified native binaries in the fallback. Only transport
    # code is adapted, with their unchanged bytes hashed by runtime-delivery.
    manifest = json.loads((fallback / 'individual-assets/individual-models.json').read_text())
    # Read identities from executable source exports. Verify the actual candidate
    # bytes before publishing a local manifest; never silently select an old graph.
    program = 'import {SEGMENTATION_MODELS} from ' + json.dumps((engine / 'experiments/segmentation/models.js').as_uri()) + ';import {EFFICIENT_LOFTR_ASSET} from ' + json.dumps((engine / 'src/efficient-loftr-assets.js').as_uri()) + ';import {SELFDM_PROPOSAL_MODELS,SELFDM_PROPOSAL_CV} from ' + json.dumps((engine / 'src/selfdm-proposal-assets.js').as_uri()) + ';process.stdout.write(JSON.stringify({selfdm:SEGMENTATION_MODELS["selfdm-map"],proposal:SEGMENTATION_MODELS["selfdm-proposal"],proposalComponents:SELFDM_PROPOSAL_MODELS,proposalCV:SELFDM_PROPOSAL_CV,eloftr:EFFICIENT_LOFTR_ASSET}));'
    identities = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', program], text=True))
    model_paths = {'selfdm': 'selfdm-ssg/browser-selfdm-512/selfdm-map-512.onnx', 'proposal':'selfdm-ssg/proposal-browser-candidate/integration-bundle-general/selfdm-proposal-bundle.json', 'eloftr': 'aliked-eloftr/export/efficient-loftr-full-fp32.onnx'}
    def verify_file(path, identity, name):
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for part in iter(lambda: stream.read(1024 ** 2), b''):
                digest.update(part)
        if path.stat().st_size != identity['bytes'] or digest.hexdigest() != identity['sha256']:
            raise ValueError('Local model differs from engine identity: ' + name)
    for name, relative in model_paths.items():
        path = resources / relative
        identity = identities[name]
        verify_file(path, identity, name)
        asset = {key: identity[key] for key in ('bytes', 'sha256')}
        asset['url'] = '../integration-resources/' + relative
        if name in ('selfdm','proposal'):
            key = 'selfdm-map' if name == 'selfdm' else 'selfdm-proposal'
            if name == 'proposal':
                bundle = json.loads(path.read_text())
                for component, expected in identities['proposalComponents'].items():
                    actual = bundle['models'][component]
                    if any(actual[key] != expected[key] for key in ('bytes','sha256')):
                        raise ValueError('Proposal bundle component identity: ' + component)
                    verify_file(path.parent / actual['file'], expected, 'proposal/' + component)
                verify_file(path.parent / bundle['cv']['file'], identities['proposalCV'], 'proposal/cv')
                for component in ('prepare', 'cvFactory'):
                    if component in bundle:
                        verify_file(path.parent / bundle[component]['file'], bundle[component], 'proposal/' + component)
            asset['variant'] = key
            manifest['segmentation'][key] = asset
        else:
            manifest['m3']['eloftr'] = asset
    # The original structured forest is private research material. Keep its
    # standard NPY arrays outside the startup assets and verify every pinned
    # component before making the complete SSG method reachable locally.
    forest_path = resources / 'ssg/full-candidate/forest-manifest.json'
    if forest_path.is_file():
        forest_bytes = forest_path.read_bytes()
        forest = json.loads(forest_bytes)
        if forest['schema'] != 'sherloq.ssg-structured-forest/1' or forest['sourceCommit'] != '66bb26eca0c7e95c76042d5bcca58f744d70a27d':
            raise ValueError('SSG original structured-forest identity differs')
        for component in forest['arrays']:
            verify_file(forest_path.parent / component['file'], component, 'ssg/' + component['name'])
        for name, component in forest['runtime'].items():
            verify_file(forest_path.parent / name, component, 'ssg/' + name)
        manifest['m3']['ssg-edges'] = {'url':'../integration-resources/ssg/full-candidate/forest-manifest.json',
            'bytes':len(forest_bytes),'sha256':hashlib.sha256(forest_bytes).hexdigest()}
    write('individual-assets/individual-models.json', (json.dumps(manifest, indent=2) + '\n').encode())
    for name in ('app.html', 'app.js', 'session-log.js'):
        write(name, (source_assets / name).read_text().replace('0.15.2', version).replace('0.35.0-export.3', '0.37.0-methods.1').encode())
    config = json.loads((source_assets / 'integrated-config.json').read_text())
    source_digest = hashlib.sha256(json.dumps({key: value['sha256'] for key, value in hashes.items() if key.startswith('unified-engine/')}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    config['baseEngineCommit'] = config['engineCommit']
    config['engineCommit'] = 'local-content-sha256:' + source_digest
    config['engineVersion'] = '0.37.0-methods.1'
    config['runtimeSourceIncrementSha256'] = source_digest
    config['qualification'] = 'Local method integration; individual native/WASM/UI proofs are recorded in the local integration report. No production deployment or new 96 MP qualification.'
    config['localMethodBuild'] = {'scope': 'local research only', 'receipt': './local-methods-receipt.json', 'baseRuntimeReceiptSha256': config.pop('runtimeReceiptSha256', None)}
    write('integrated-config.json', (json.dumps(config, indent=2) + '\n').encode())
    write('local-methods-receipt.json', (json.dumps({'scope': 'local research only; no production deployment', 'version': version, 'engineSource': str(engine), 'fallback': str(fallback), 'files': hashes}, indent=2) + '\n').encode())
    return hashes


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fallback', type=Path, required=True)
    parser.add_argument('--resources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--version', default='0.17.0-local')
    args = parser.parse_args()
    hashes = stage(args.fallback.resolve(), args.resources.resolve(), args.output.resolve(), args.version)
    print(json.dumps({'files': len(hashes), 'bytes': sum(v['bytes'] for v in hashes.values()), 'output': str(args.output.resolve())}))
