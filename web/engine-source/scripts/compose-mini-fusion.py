"""Join the two Mini CrossApply paths and the projected eight-channel fusion.

Global context matrices are still produced by the original complete-image
context passes. The runtime supplies both native feature bands with a one-row
halo; only the final eight-channel core is copied out of the joined graph.
No learned tensor, attention operator, image or numerical output is generated.
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


def join(first, second, channel, name):
    models = [first, second, channel]
    assert len({model.ir_version for model in models}) == 1
    assert all([serialized(v) for v in model.opset_import] == [serialized(v) for v in first.opset_import] for model in models)
    assert all(not model.functions and not model.graph.sparse_initializer for model in models)
    assert [v.name for v in first.graph.input] == [v.name for v in second.graph.input] == ['x', 'context']
    assert [v.name for v in channel.graph.input] == ['a', 'b']
    assert all([v.name for v in model.graph.output] == ['result'] for model in models)
    a, am = rename_graph(first.graph, 'cross1/', {'x':'a', 'context':'contextb'})
    b, bm = rename_graph(second.graph, 'cross2/', {'x':'b', 'context':'contexta'})
    c, cm = rename_graph(channel.graph, 'channel/', {'a':am['result'], 'b':bm['result'], 'result':'result'})
    inputs = {value.name:copy.deepcopy(value) for graph in (a, b) for value in graph.input}
    output = copy.deepcopy(channel.graph.output[0]); output.name = 'result'
    graph = helper.make_graph([*a.node, *b.node, *c.node], name,
                              [inputs[k] for k in ['a', 'b', 'contexta', 'contextb']], [output],
                              initializer=[*a.initializer, *b.initializer, *c.initializer],
                              value_info=[*a.value_info, *b.value_info, *c.value_info])
    joined = copy.deepcopy(channel); joined.graph.CopyFrom(graph)
    onnx.checker.check_model(joined, full_check=True)
    offset = 0
    initializers = []
    for original, renamed, mapping, prefix in [(first.graph, a, am, 'cross1/'),
                                               (second.graph, b, bm, 'cross2/'),
                                               (channel.graph, c, cm, 'channel/')]:
        verify_nodes(original.node, joined.graph.node[offset:offset+len(renamed.node)], mapping, prefix)
        offset += len(renamed.node)
        for before, after in zip(original.initializer, renamed.initializer):
            assert without_name(before) == without_name(after)
            initializers.append({'source':before.name, 'composed':after.name,
                                 'dtype':before.data_type, 'shape':list(before.dims),
                                 'tensorSha256':sha(without_name(before))})
    assert len(initializers) == len(joined.graph.initializer)
    return joined, {'cross1Nodes':len(a.node), 'cross2Nodes':len(b.node),
                    'channelNodes':len(c.node), 'totalNodes':len(joined.graph.node),
                    'allOperatorsAndAttributesIdentical':True,
                    'allInitializerPayloadsIdentical':True, 'initializers':initializers,
                    'inputNames':[v.name for v in joined.graph.input],
                    'outputNames':[v.name for v in joined.graph.output]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--plan-only', action='store_true')
    args = parser.parse_args()
    assert not(args.apply and args.plan_only)
    source = args.source.resolve()
    output = source if args.apply else (args.output or source.parent/'prepared-fusion').resolve()
    assert args.apply or output != source
    if not args.plan_only:
        output.mkdir(parents=True, exist_ok=True)
    before = (source/'manifest.json').read_bytes(); manifest = json.loads(before)
    assert manifest['method'] == 'trufor-mini'
    assert manifest['stateSha256'] == '07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe'
    candidate = copy.deepcopy(manifest); stages = []; assets = {}
    for stage_index, stage in enumerate(candidate['stages'], 1):
        assert len(stage['fusion']) == 2 and stage['fusionOutputChannels'] == 8
        operators = [stage['fusion'][0]['apply'], stage['fusion'][1]['apply'], stage['channel']]
        models = []
        for name in operators:
            spec = manifest['assets'][name]; raw = (source/spec['file']).read_bytes()
            assert len(raw) == spec['bytes'] and sha(raw) == spec['sha256']
            assert spec.get('graphOptimizationLevel') == 'disabled'
            models.append(onnx.load_model_from_string(raw))
        name = f's{stage_index}-fusion-joint'
        model, receipt = join(*models, name)
        raw = serialized(model)
        asset = {'file':name+'.onnx', 'bytes':len(raw), 'sha256':sha(raw), 'graphOptimizationLevel':'disabled'}
        target = output/asset['file']
        if target.exists():
            assert target.read_bytes() == raw, 'Existing joined fusion graph differs'
        elif not args.plan_only:
            target.write_bytes(raw)
        stage['fusionJoint'] = {'name':name, 'halo':1}
        candidate['assets'][name] = asset; assets[name] = asset
        stages.append({'stage':stage_index, 'channels':stage['channels'], 'outputChannels':8,
                       'sourceOperators':operators, 'asset':asset, **receipt})
    assert len(stages) == 4
    assert (source/'manifest.json').read_bytes() == before, 'Catalogue changed concurrently'
    if args.apply:
        temporary = source/'manifest.json.fusion.tmp'; temporary.write_text(json.dumps(candidate, indent=2)+'\n')
        temporary.replace(source/'manifest.json')
    elif not args.plan_only:
        (output/'manifest-overlay.json').write_text(json.dumps({'assets':assets,
            'stages':[{'stage':row['stage'], 'fusionJoint':{'name':row['asset']['file'].removesuffix('.onnx'), 'halo':1}}
                      for row in stages]}, indent=2)+'\n')
    report = {'applied':args.apply, 'planOnly':args.plan_only, 'newInference':False,
              'artificialImagesCreated':False, 'sourceManifestSha256':sha(before),
              'miniStateSha256':manifest['stateSha256'], 'allInitializersUnchanged':True,
              'allOperatorsAndAttributesUnchanged':True, 'globalContextPassesUnchanged':True,
              'contextMapping':{'cross1':'a, contextb', 'cross2':'b, contexta', 'projectedChannel':'cross1.result, cross2.result'},
              'runtimeContract':'Supply matching native feature bands a/b including one Channel-convolution halo row at interior edges; contexts a/b remain complete-image matrices. Crop only the final eight-channel result.',
              'legacyAssetsRetained':True, 'stages':stages,
              'addedAssetBytes':sum(v['bytes'] for v in assets.values()),
              'qualification':'Static composition only; CPU/WebGPU numerical parity and performance must be measured separately.'}
    path = args.report or output/'fusion-composition.json'; path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'applied':args.apply, 'stages':len(stages), 'composedBytes':report['addedAssetBytes'],
                      'allInitializersUnchanged':True, 'allOperatorsUnchanged':True}))


if __name__ == '__main__':
    main()
