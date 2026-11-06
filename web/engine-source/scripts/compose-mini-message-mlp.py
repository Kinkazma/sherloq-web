"""Join existing Mini message-add and noise MLP graphs, without model execution.

Default: prepare new graphs plus a manifest overlay in a separate directory.
--apply installs the verified composition in the supplied operator catalogue.
There is no PyTorch import, fitting, image generation or numerical inference.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json

import onnx
from onnx import helper


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def serialized(value):
    return value.SerializeToString(deterministic=True)


def without_name(value):
    value = copy.deepcopy(value)
    value.name = ''
    return serialized(value)


def rename_graph(graph, prefix, ports):
    """Rename tensor references only; every operator attribute stays unchanged."""
    graph = copy.deepcopy(graph)
    names = {v.name for group in (graph.input, graph.output, graph.value_info,
                                  graph.initializer) for v in group}
    for node in graph.node:
        assert all(attr.type not in (onnx.AttributeProto.GRAPH, onnx.AttributeProto.GRAPHS)
                   for attr in node.attribute), 'Nested graph requires an explicit composition adapter'
        names.update(v for v in (*node.input, *node.output) if v)
    mapping = {name: ports.get(name, prefix + name) for name in names}
    assert len(set(mapping.values())) == len(mapping), 'Tensor names collided during composition'
    for group in (graph.input, graph.output, graph.value_info, graph.initializer):
        for value in group:
            value.name = mapping[value.name]
    for node in graph.node:
        node.name = prefix + node.name if node.name else ''
        for group in (node.input, node.output):
            for i, name in enumerate(group):
                if name:
                    group[i] = mapping[name]
    return graph, mapping


def verify_nodes(original, joined, mapping, prefix):
    assert len(original) == len(joined)
    inverse = {after: before for before, after in mapping.items()}
    for before, after in zip(original, joined):
        restored = copy.deepcopy(after)
        restored.name = restored.name[len(prefix):] if restored.name else ''
        for group in (restored.input, restored.output):
            for i, name in enumerate(group):
                if name:
                    group[i] = inverse[name]
        assert serialized(before) == serialized(restored), 'An operator or constant changed'


def compose(message, mlp, name):
    assert message.ir_version == mlp.ir_version
    assert [serialized(x) for x in message.opset_import] == [serialized(x) for x in mlp.opset_import]
    assert not message.functions and not mlp.functions
    assert not message.graph.sparse_initializer and not mlp.graph.sparse_initializer
    assert [x.name for x in message.graph.input] == ['x', 'message', 'grid']
    assert [x.name for x in message.graph.output] == ['result']
    assert [x.name for x in mlp.graph.input] == ['x']
    assert [x.name for x in mlp.graph.output] == ['result']
    a, am = rename_graph(message.graph, 'message/', {'x': 'x', 'message': 'message', 'grid': 'grid'})
    b, bm = rename_graph(mlp.graph, 'mlp/', {'x': am['result'], 'result': 'result'})
    x = copy.deepcopy(mlp.graph.input[0]); x.name = 'x'
    inputs = [x, *[copy.deepcopy(v) for v in a.input if v.name != 'x']]
    output = copy.deepcopy(mlp.graph.output[0]); output.name = 'result'
    graph = helper.make_graph([*a.node, *b.node], name, inputs, [output],
                              initializer=[*a.initializer, *b.initializer],
                              value_info=[*a.value_info, *b.value_info])
    model = copy.deepcopy(mlp)
    model.graph.CopyFrom(graph)
    onnx.checker.check_model(model, full_check=True)
    verify_nodes(message.graph.node, model.graph.node[:len(a.node)], am, 'message/')
    verify_nodes(mlp.graph.node, model.graph.node[len(a.node):], bm, 'mlp/')
    assert len(model.graph.initializer) == len(message.graph.initializer) + len(mlp.graph.initializer)
    initializers = []
    for source, renamed, mapping in [(message.graph, a, am), (mlp.graph, b, bm)]:
        for before, after in zip(source.initializer, renamed.initializer):
            assert before.name in mapping and after.name == mapping[before.name]
            assert without_name(before) == without_name(after), 'An initializer changed'
            initializers.append({'source':before.name, 'composed':after.name,
                                 'dtype':before.data_type, 'shape':list(before.dims),
                                 'tensorSha256':sha(without_name(before))})
    return model, {'inputNames':[v.name for v in graph.input],
                   'outputNames':[v.name for v in graph.output],
                   'messageNodes':len(a.node), 'mlpNodes':len(b.node),
                   'totalNodes':len(graph.node), 'allOperatorsAndAttributesIdentical':True,
                   'allInitializersIdenticalExceptNames':True, 'initializers':initializers}


def prune_source_assets(candidate):
    """Remove only source assets whose replacement is active in every noise block.

    This edits catalogue references, never ONNX bytes. Unindexed local files
    can remain available for inspection; the build selects indexed assets.
    """
    noise = [block for stage in candidate['stages'] for block in stage['streams'][1]['blocks']]
    assert len(noise) == 16 and all(block.get('messageMlp', {}).get('halo') == 1
                                   and block['messageMlp']['name'] in candidate['assets'] for block in noise)
    obsolete = set()
    for block in noise:
        if 'mlp' in block:
            obsolete.add(block.pop('mlp'))
    assert len(obsolete) in (0, 16)
    if candidate.get('messageAdd'):
        obsolete.add(candidate.pop('messageAdd'))
    references = set()
    def visit(value):
        if isinstance(value, str):
            references.add(value)
        elif isinstance(value, dict):
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
    visit({key:value for key,value in candidate.items() if key != 'assets'})
    assert not obsolete & references, 'A source operator is still referenced'
    removed = {name:candidate['assets'].pop(name) for name in sorted(obsolete)}
    assert all(block.get('mlp') for stage in candidate['stages'] for block in stage['streams'][0]['blocks'])
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--plan-only', action='store_true', help='Verify and report the planned catalogue without writing candidate graphs.')
    parser.add_argument('--prune-source-assets', action='store_true',
                        help='Remove obsolete noise MLP/message-add references after verified composition; leave their local files intact.')
    args = parser.parse_args()
    assert not (args.apply and args.plan_only), 'A plan cannot apply changes'
    source = args.source.resolve()
    output = source if args.apply else (args.output or source.parent/'prepared-message-mlp').resolve()
    assert args.apply or output != source, 'Use --apply to modify the source catalogue'
    if not args.plan_only:
        output.mkdir(parents=True, exist_ok=True)
    manifest_path = source/'manifest.json'
    before = manifest_path.read_bytes()
    manifest = json.loads(before)
    assert manifest['method'] == 'trufor-mini'
    assert manifest['stateSha256'] == '07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe'
    candidate = copy.deepcopy(manifest)
    noise = [block for stage in candidate['stages'] for block in stage['streams'][1]['blocks']]
    assert len(noise) == 16
    already_pruned = all('mlp' not in block and block.get('messageMlp', {}).get('halo') == 1 for block in noise)
    if already_pruned:
        # Idempotent on an already-qualified, pruned catalogue. Verify the exact
        # indexed graph bytes; original source graphs are no longer required.
        checked = []
        for block in noise:
            asset = candidate['assets'][block['messageMlp']['name']]
            raw = (source/asset['file']).read_bytes()
            assert len(raw) == asset['bytes'] and sha(raw) == asset['sha256']
            model = onnx.load_model_from_string(raw)
            onnx.checker.check_model(model, full_check=True)
            assert [v.name for v in model.graph.input] == ['x', 'message', 'grid']
            assert [v.name for v in model.graph.output] == ['result']
            checked.append(asset['sha256'])
        removed = prune_source_assets(candidate) if args.prune_source_assets else {}
        assert candidate == manifest and not removed, 'Pruned catalogue still contains obsolete operator references'
        result = {'applied':args.apply, 'alreadyComposedAndPruned':True, 'idempotent':True,
                  'catalogueBytesUnchanged':True, 'checkedJoinedGraphs':len(checked),
                  'newInference':False, 'artificialImagesCreated':False,
                  'originalAssetPayloadsNotRequiredForIdempotentRecheck':True,
                  'sourceManifestSha256':sha(before), 'miniStateSha256':manifest['stateSha256']}
        report_path = args.report or output/'message-mlp-composition.json'
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(result))
        return
    message_spec = manifest['assets'][manifest['messageAdd']]
    message_raw = (source/message_spec['file']).read_bytes()
    assert len(message_raw) == message_spec['bytes'] and sha(message_raw) == message_spec['sha256']
    message = onnx.load_model_from_string(message_raw)
    blocks, new_assets = [], {}
    for stage_index, stage in enumerate(candidate['stages'], 1):
        assert len(stage['streams']) == 2
        for branch_index, stream in enumerate(stage['streams']):
            if branch_index == 0:
                continue
            for block_index, block in enumerate(stream['blocks']):
                assert block['approximation'] in ('pool2', 'global')
                original = manifest['assets'][block['mlp']]
                raw = (source/original['file']).read_bytes()
                assert len(raw) == original['bytes'] and sha(raw) == original['sha256']
                name = block['mlp'].removesuffix('-mlp') + '-message-mlp'
                model, receipt = compose(message, onnx.load_model_from_string(raw), name)
                composed_raw = serialized(model)
                asset = {'file':name+'.onnx', 'bytes':len(composed_raw), 'sha256':sha(composed_raw),
                         'graphOptimizationLevel':original.get('graphOptimizationLevel', 'disabled')}
                assert asset['graphOptimizationLevel'] == 'disabled'
                target = output/asset['file']
                if target.exists():
                    assert target.read_bytes() == composed_raw, 'Existing candidate bytes differ'
                elif not args.plan_only:
                    target.write_bytes(composed_raw)
                block['messageMlp'] = {'name':name, 'halo':1}
                candidate['assets'][name] = asset
                new_assets[name] = asset
                blocks.append({'stage':stage_index, 'branch':'noise', 'block':block_index,
                               'sourceMlp':block['mlp'], 'sourceMlpSha256':original['sha256'],
                               'sourceMessageSha256':message_spec['sha256'], 'asset':asset, **receipt})
    assert len(blocks) == 16
    removed_assets = prune_source_assets(candidate) if args.prune_source_assets else {}
    assert manifest_path.read_bytes() == before, 'Catalogue changed concurrently'
    if args.apply:
        temporary = manifest_path.with_name('manifest.json.message-mlp.tmp')
        temporary.write_text(json.dumps(candidate, indent=2)+'\n')
        temporary.replace(manifest_path)
    elif not args.plan_only:
        (output/'manifest-overlay.json').write_text(json.dumps({'assets':new_assets,
            'removeAssetKeys':list(removed_assets), 'removeNoiseBlockMlp':bool(args.prune_source_assets),
            'removeRootMessageAdd':bool(args.prune_source_assets),
            'blocks':[{'stage':b['stage'], 'branch':'noise', 'block':b['block'],
                       'messageMlp':{'name':b['asset']['file'].removesuffix('.onnx'), 'halo':1}}
                      for b in blocks]}, indent=2)+'\n')
    report = {'applied':args.apply, 'planOnly':args.plan_only, 'newInference':False, 'artificialImagesCreated':False,
              'composition':'MLP(x + GridSample(message, grid)); original learned MLP operators and constants retained',
              'haloContract':'Runtime supplies one native input row halo to MLP, builds message grid for that complete halo band, then crops its core output.',
              'allInitializerPayloadsUnchanged':True, 'allNodeAttributesAndComputationsUnchanged':True,
              'miniStateSha256':manifest['stateSha256'], 'sourceManifestSha256':sha(before),
              'blocks':blocks, 'composedAssetBytes':sum(v['bytes'] for v in new_assets.values()),
              'sourceAssetsPrunedFromCatalogue':removed_assets,
              'payloadBytesRemoved':sum(value['bytes'] for value in removed_assets.values()),
              'localSourceFilesDeleted':False,
              'notes':['This static structural verification is not a numerical runtime qualification.',
                       'Graph inputs are x, message, grid and the output is result. RGB branch and attention operators are unchanged.',
                       'The original assets remain intact; no existing ONNX file is overwritten.']}
    report_path = args.report or output/'message-mlp-composition.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'applied':args.apply, 'blocks':len(blocks), 'composedBytes':report['composedAssetBytes'],
                      'allInitializersIdentical':True, 'allOperatorsIdentical':True}))


if __name__ == '__main__':
    main()
