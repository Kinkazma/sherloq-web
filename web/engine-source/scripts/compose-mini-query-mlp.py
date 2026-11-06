"""Compose existing exact RGB QueryWindow and MlpWindow ONNX operators.

The joined graph consumes a two-dimensional native query band with its one-row
MLP halo, plus the unchanged complete key/value banks. This is pure graph
composition: no PyTorch, image generation, fitting or inference is involved.
Legacy query/MLP assets stay available when a complete halo row cannot fit the
attention budget or when the large-key split-value operator is selected.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import runpy

import onnx
from onnx import helper

utilities = runpy.run_path(str(Path(__file__).with_name('compose-mini-message-mlp.py')))
rename_graph, verify_nodes, without_name = [utilities[name] for name in ('rename_graph', 'verify_nodes', 'without_name')]
serialized = lambda value:value.SerializeToString(deterministic=True)
sha = lambda value:hashlib.sha256(value).hexdigest()


def join(query, mlp, name):
    assert query.ir_version == mlp.ir_version
    assert [serialized(v) for v in query.opset_import] == [serialized(v) for v in mlp.opset_import]
    assert not query.functions and not mlp.functions
    assert not query.graph.sparse_initializer and not mlp.graph.sparse_initializer
    assert [v.name for v in query.graph.input] == ['x', 'key', 'value']
    assert [v.name for v in query.graph.output] == [v.name for v in mlp.graph.output] == ['result']
    assert [v.name for v in mlp.graph.input] == ['x']
    q, qm = rename_graph(query.graph, 'query/', {'x':'x', 'key':'key', 'value':'value'})
    m, mm = rename_graph(mlp.graph, 'mlp/', {'x':qm['result'], 'result':'result'})
    output = copy.deepcopy(mlp.graph.output[0]); output.name = 'result'
    graph = helper.make_graph([*q.node, *m.node], name, list(q.input), [output],
                              initializer=[*q.initializer, *m.initializer],
                              value_info=[*q.value_info, *m.value_info])
    joined = copy.deepcopy(query); joined.graph.CopyFrom(graph)
    onnx.checker.check_model(joined, full_check=True)
    verify_nodes(query.graph.node, joined.graph.node[:len(q.node)], qm, 'query/')
    verify_nodes(mlp.graph.node, joined.graph.node[len(q.node):], mm, 'mlp/')
    initializers = []
    for original, renamed in [(query.graph, q), (mlp.graph, m)]:
        for before, after in zip(original.initializer, renamed.initializer):
            assert without_name(before) == without_name(after)
            initializers.append({'source':before.name, 'composed':after.name,
                                 'dtype':before.data_type, 'shape':list(before.dims),
                                 'tensorSha256':sha(without_name(before))})
    assert len(initializers) == len(joined.graph.initializer)
    return joined, {'queryNodes':len(q.node), 'mlpNodes':len(m.node),
                    'totalNodes':len(joined.graph.node), 'initializers':initializers,
                    'allOperatorsAndAttributesIdentical':True,
                    'allInitializerPayloadsIdentical':True,
                    'inputNames':[v.name for v in joined.graph.input],
                    'outputNames':[v.name for v in joined.graph.output]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--plan-only', action='store_true')
    args = parser.parse_args()
    assert not(args.apply and args.plan_only)
    source = args.source.resolve()
    output = source if args.apply else (args.output or source.parent/'prepared-query-mlp').resolve()
    assert args.apply or output != source
    if not args.plan_only:
        output.mkdir(parents=True, exist_ok=True)
    before = (source/'manifest.json').read_bytes(); manifest = json.loads(before)
    assert manifest['method'] == 'trufor-mini'
    assert manifest['stateSha256'] == '07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe'
    assert manifest['attentionPolicy']['rgb'] == ['exact']*4
    candidate = copy.deepcopy(manifest); blocks = []; assets = {}
    for stage_index, stage in enumerate(candidate['stages'], 1):
        for block_index, block in enumerate(stage['streams'][0]['blocks']):
            assert block['approximation'] == 'exact'
            sources = []
            for key in ('query', 'mlp'):
                spec = manifest['assets'][block[key]]
                raw = (source/spec['file']).read_bytes()
                assert len(raw) == spec['bytes'] and sha(raw) == spec['sha256']
                assert spec.get('graphOptimizationLevel') == 'disabled'
                sources.append(onnx.load_model_from_string(raw))
            name = block['query'].removesuffix('-query') + '-query-mlp'
            model, receipt = join(*sources, name)
            raw = serialized(model)
            asset = {'file':name+'.onnx', 'bytes':len(raw), 'sha256':sha(raw), 'graphOptimizationLevel':'disabled'}
            target = output/asset['file']
            if target.exists():
                assert target.read_bytes() == raw, 'Existing composed query graph differs'
            elif not args.plan_only:
                target.write_bytes(raw)
            block['queryMlp'] = {'name':name, 'halo':1}
            candidate['assets'][name] = asset; assets[name] = asset
            blocks.append({'stage':stage_index, 'branch':'rgb', 'block':block_index,
                           'query':block['query'], 'mlp':block['mlp'], 'asset':asset, **receipt})
    assert len(blocks) == 16
    assert (source/'manifest.json').read_bytes() == before, 'Catalogue changed concurrently'
    if args.apply:
        temporary = source/'manifest.json.query-mlp.tmp'
        temporary.write_text(json.dumps(candidate, indent=2)+'\n'); temporary.replace(source/'manifest.json')
    elif not args.plan_only:
        (output/'manifest-overlay.json').write_text(json.dumps({'assets':assets,
            'blocks':[{'stage':b['stage'], 'branch':'rgb', 'block':b['block'],
                       'queryMlp':{'name':b['asset']['file'].removesuffix('.onnx'), 'halo':1}}
                      for b in blocks]}, indent=2)+'\n')
    report = {'applied':args.apply, 'planOnly':args.plan_only, 'newInference':False,
              'artificialImagesCreated':False, 'sourceManifestSha256':sha(before),
              'miniStateSha256':manifest['stateSha256'], 'allInitializersUnchanged':True,
              'allOperatorsAndAttributesUnchanged':True, 'completeKeyValueDomainUnchanged':True,
              'runtimeContract':'Supply x as native full-width rows with one MLP halo row on each interior edge; key/value contain every original global key. Crop only after joined output. Use legacy query/MLP if halo rows exceed the admitted query budget or split-value attention is selected.',
              'legacyAssetsRetained':True, 'blocks':blocks,
              'addedAssetBytes':sum(v['bytes'] for v in assets.values()),
              'qualification':'Static composition only; numeric CPU/WebGPU parity and timing remain to be measured on real images.'}
    path = args.report or output/'query-mlp-composition.json'; path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'applied':args.apply, 'blocks':len(blocks), 'composedBytes':report['addedAssetBytes'],
                      'allInitializersUnchanged':True, 'allOperatorsUnchanged':True}))


if __name__ == '__main__':
    main()
