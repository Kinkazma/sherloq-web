#!/usr/bin/env python3
"""Generate the release's functional graph from its verified effective model config.

Does not read model bodies. --metadata-root contains ordinary small JSON files;
every config is checked against the supplied immutable dependency manifest.
"""
import argparse
import hashlib
import json
import pathlib
import posixpath
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]


def generate(manifest, metadata_root, assets_root=None):
    assets_root = pathlib.Path(assets_root or ROOT / 'sherloq-browser/assets')
    files = manifest['files']
    def metadata(path):
        raw = (pathlib.Path(metadata_root) / path).read_bytes()
        if len(raw) != files[path]['size'] or hashlib.sha256(raw).hexdigest() != files[path]['sha256']:
            raise ValueError('Model configuration identity differs: ' + path)
        return json.loads(raw)

    individual = metadata('individual-assets/individual-models.json')
    forge = metadata('unified-assets/forgeryscope/manifest.json')
    aliked = metadata('unified-assets/aliked-segments/manifest.json')
    metadata('unified-assets/neural-runtime/manifest.json')
    tree_text = (assets_root / 'tool-tree.js').read_text()
    tree = json.loads(tree_text[tree_text.index('['):].rstrip().rstrip(';'))
    neural = re.findall(r"\['([^']+)','([^']+)'(?:,'([^']+)')?\]", (assets_root / 'neural-clone-ui.js').read_text().split('];', 1)[0])
    models = individual['m3']
    features = []
    groups = [{'id': id, 'fr': fr, 'en': en} for id, fr, en in [
        ('core', 'Interface et outils protégés', 'Interface and protected tools'),
        ('neural-detectors', 'Détecteurs et modèles', 'Detectors and models'),
        ('segmentation', 'Segmentation des clones', 'Clone segmentation'),
        ('learned-clones', 'Appariements et contours appris', 'Learned matching and edges'),
        ('forgeryscope', 'Forgeryscope', 'Forgeryscope'),
        ('composite', 'Détection de montage', 'Composite splicing'),
    ]]
    def directory(prefix):
        paths = sorted(path for path in files if path.startswith(prefix.rstrip('/') + '/'))
        if not paths: raise ValueError('Configured resource family is absent: ' + prefix)
        return paths

    def urls(value):
        found = set()
        def visit(item):
            if isinstance(item, dict):
                if 'url' in item:
                    path = posixpath.normpath(posixpath.join('unified-assets', item['url']))
                    if path not in files: raise ValueError('Effective model URL missing from manifest: ' + path)
                    if item.get('sha256') and item['sha256'] != files[path]['sha256']: raise ValueError('Effective model SHA differs: ' + path)
                    if item.get('bytes') is not None and item['bytes'] != files[path]['size']: raise ValueError('Effective model length differs: ' + path)
                    found.add(path)
                for child in item.values(): visit(child)
            elif isinstance(item, list):
                for child in item: visit(child)
        visit(value)
        return sorted(found)

    def add(id, fr, en=None, *, resources=(), group=None, tasks=(), depends=(), protected=False, internal=False):
        paths = sorted(set(resources))
        if any(path not in files for path in paths): raise ValueError('Unknown resource for ' + id)
        feature = dict(id=id, fr=fr, en=en or fr, group=group, protected=protected, dependsOn=list(depends), resources=paths, tasks=list(tasks))
        if internal: feature['internal'] = True
        features.append(feature)

    shared_runtime = directory('unified-assets/neural-runtime') + directory('unified-assets/ort')
    add('resource.neural-runtime', 'Exécution neuronale partagée', 'Shared neural runtime', resources=shared_runtime, internal=True)
    panel = 'unified-assets/forgeryscope/' + forge['assets']['yolo_panel_extractor']['file']
    if files[panel]['sha256'] != forge['assets']['yolo_panel_extractor']['sha256']: raise ValueError('Panel model identity differs')
    add('resource.forgeryscope-panels', 'Détection des panneaux', 'Panel detection', resources=[panel, 'unified-assets/forgeryscope/manifest.json', 'unified-assets/aliked-segments/manifest.json'], depends=['resource.neural-runtime'], internal=True)
    # Batch preparation is required before any scientific batch execution. It
    # uses Forgeryscope's panel detector and PP-OCRv6, but no clone embedder.
    add('batch.scientific-preparation', 'Préparation scientifique des lots', 'Scientific batch preparation', protected=True, resources=directory('batch-models'), depends=['resource.forgeryscope-panels'])
    forge_paths = ['unified-assets/forgeryscope/' + spec['file'] for spec in forge['assets'].values()]
    for key, spec in forge['assets'].items():
        path = 'unified-assets/forgeryscope/' + spec['file']
        if files[path]['sha256'] != spec['sha256'] or files[path]['size'] != spec['bytes']: raise ValueError('Forgeryscope asset identity differs: ' + key)
    aliked_paths = ['unified-assets/aliked-segments/' + spec['file'] for spec in aliked['assets'].values()]
    add('m2.forgeryscope', 'Forgeryscope — Auto, microscopie, blots et pistes', 'Forgeryscope — Auto, microscopy, blots and lanes', group='forgeryscope', resources=[path for path in forge_paths if path != panel] + aliked_paths, depends=['resource.forgeryscope-panels'], tasks=[{'operation': 'm2.forgeryscope'}])
    add('ai.clones.d2prl', 'D2PRL', group='neural-detectors', resources=directory('unified-assets/d2prl'), tasks=[{'operation': 'ai.clones.d2prl'}])
    add('composite', 'Détection de montage', 'Composite splicing', group='composite', resources=directory('composite-assets'), tasks=[{'operation': 'composite'}])
    add('resource.cfa-operators', 'Opérateurs CFA et Noiseprint++', 'CFA and Noiseprint++ operators', resources=[path for path in directory('individual-assets/cfa-m2') if path.endswith(('operators.mjs', 'operators.wasm'))], internal=True)
    for method, prefixes, deps in [
        ('cfa', ['individual-assets/cfa-m2'], ['resource.cfa-operators']),
        ('catnet', ['individual-assets/catnet-segments', 'individual-assets/catnet'], ['resource.neural-runtime']),
        ('trufor', ['individual-assets/trufor-split-value', 'individual-assets/trufor-segments', 'individual-assets/trufor-npp'], ['resource.neural-runtime', 'resource.cfa-operators']),
    ]:
        resources = sum([directory(prefix) for prefix in prefixes], [])
        if method == 'cfa': resources = [path for path in resources if not path.endswith(('operators.mjs', 'operators.wasm'))]
        add('m2.' + method, {'cfa': 'CFA — dématriçage', 'catnet': 'CAT-Net', 'trufor': 'TruFor'}[method], group='neural-detectors', resources=resources, depends=deps, tasks=[{'operation': 'm2.' + method}])
    for variant, fr, en in neural:
        if variant.startswith('forgeryscope') or variant == 'd2prl': continue
        if variant not in individual['segmentation']: raise ValueError('Neural menu is not configured: ' + variant)
        references = urls(individual['segmentation'][variant])
        if variant == 'selfdm-map': resources = references
        else:
            # The directory follows the actual CPU/GPU config URL, never a UI slot.
            model_dir = '/'.join(references[0].split('/')[:3])
            resources = directory(model_dir)
        add('segmentation.' + variant, fr, en or fr, group='segmentation', resources=resources, tasks=[{'operation': 'ai.clones.segmentation', 'params': {'variant': variant}}])

    mappings = [
        ('clone.xfeat', 'XFeat', ['xfeat-paged'], ['XFeat'], []),
        ('clone.xfeat-glue', 'XFeat + LighterGlue', ['xfeat-glue-paged'], ['XFeat + LighterGlue'], ['clone.xfeat']),
        ('clone.aliked', 'ALIKED', ['aliked-n16'], ['ALIKED'], []),
        ('clone.aliked-rotation', 'ALIKED rotation', ['aliked-n16rot'], ['ALIKED rotation'], []),
        ('resource.aliked-glue', 'LightGlue ALIKED partagé', ['aliked-glue-paged'], [], []),
        ('clone.aliked-glue', 'ALIKED + LightGlue', [], ['ALIKED + LightGlue'], ['clone.aliked', 'resource.aliked-glue']),
        ('clone.aliked-rotation-glue', 'ALIKED rotation + LightGlue', [], ['ALIKED rotation + LightGlue'], ['clone.aliked-rotation', 'resource.aliked-glue']),
        ('clone.sift-glue', 'SIFT + LightGlue', ['sift-glue-paged'], ['SIFT + LightGlue'], []),
        ('clone.efficient-loftr', 'EfficientLoFTR', ['eloftr'], ['EfficientLoFTR'], []),
        ('clone.ssg', 'SSG — contours structurés', ['ssg-edges'], ['SSG'], []),
    ]
    adapter = (assets_root / 'unified-engine/src/m3-adapter.js').read_text()
    for id, label, keys, algorithms, deps in mappings:
        paths = []
        for key in keys:
            if key not in models: raise ValueError('Runtime M3 key absent: ' + key)
            paths += urls(models[key])
        if id == 'clone.ssg':
            if "'SSG'" not in adapter: raise ValueError('SSG is not connected to the effective M3 adapter')
            paths += directory('individual-assets/m3/ssg')
        add(id, label, group=None if id.startswith('resource.') else 'learned-clones', resources=paths, depends=deps, internal=id.startswith('resource.'), tasks=[{'operation': 'tampering.copyMove.sparse', 'params': {'algorithm': algorithm}} for algorithm in algorithms])
    for model in ['safire', 'focal', 'adaifl']:
        operation = ('ai.sources.' if model == 'safire' else 'ai.localization.') + model
        add(operation, {'safire': 'SAFIRE — sources', 'focal': 'FOCAL — localisation', 'adaifl': 'AdaIFL — localisation'}[model], group='neural-detectors', resources=urls(models[model]), tasks=[{'operation': operation}])
    add('various.median','Classificateur médian XGBoost','Median XGBoost classifier',group='neural-detectors',resources=urls(individual['median']),tasks=[{'operation':'various.median'}])
    claimed = set(path for feature in features for path in feature['resources'])
    optional_ops = {task['operation'] for feature in features for task in feature['tasks']}
    core_tools = [item for group in tree for item in group['items'] if item['id'] not in optional_ops]
    # All unassigned code, codecs, manifests, lightweight tools and existing
    # import facilities remain protected. Newly configured public variants above
    # become default roots unless their stable group is explicitly excluded.
    add('core', 'Interface et outils nécessaires', 'Interface and required tools', group='core', protected=True, resources=sorted(set(files) - claimed))
    for item in core_tools:
        if item['id']=='original': id='tool.original'
        else: id=item['id'].lower()
        add(id, item['fr'], item['en'], group='core', protected=True, depends=['core'], tasks=[{'operation': item['id']}])
    for id,fr,en in [('ela.energy','ELA — énergie','ELA — energy'),('ela.biomes','ELA — biomes','ELA — biomes')]:
        add(id,fr,en,group='core',protected=True,depends=['core'],tasks=[{'operation':id}])
    classical = ['SIFT', 'RootSIFT', 'AKAZE', 'BRISK', 'ORB', 'SIFT + G2NN + RANSAC', 'SIFT + G2NN + RANSAC + Panels + Text']
    for algorithm in classical:
        id='clone.'+re.sub(r'[^a-z0-9]+','-',algorithm.lower()).strip('-')
        add(id,algorithm,group='core',protected=True,depends=['core'],tasks=[{'operation':'tampering.copyMove.sparse','params':{'algorithm':algorithm}}])
    dense_text=(assets_root / 'unified-engine/src/dense-profiles.js').read_text().split('Object.freeze([',1)[1].split(']);',1)[0]
    for index,algorithm in enumerate(re.findall(r"'([^']+)'",dense_text)):
        id='clone.'+re.sub(r'[^a-z0-9]+','-',algorithm.lower()).strip('-')
        add(id,algorithm,group='core',protected=True,depends=['core'],tasks=[{'operation':'tampering.copyMove.dense','params':{'profile':algorithm}},{'operation':'tampering.copyMove.sparse','params':{'algorithm':algorithm}}])
    return {'schema': 'sherloq.features/1', 'groups': groups, 'features': features}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=pathlib.Path, required=True)
    parser.add_argument('--metadata-root', type=pathlib.Path, default=ROOT / 'feature-inputs')
    parser.add_argument('--assets-root', type=pathlib.Path, default=ROOT / 'sherloq-browser/assets')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    value = generate(json.loads(args.manifest.read_text()), args.metadata_root, args.assets_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n')
    print(json.dumps({'features': len(value['features']), 'bytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == '__main__': main()
