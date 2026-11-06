"""Expose the existing post-ReLU channel, preserving all learned operators.

Requires Python, NumPy and ONNX. All original model paths are explicit CLI arguments.
This patches a copy of the deployed graph, never the live model.
"""
from pathlib import Path
import hashlib, json
import numpy as np
import onnx
from onnx import helper, numpy_helper

import argparse, os
parser=argparse.ArgumentParser(description='Join the original TruFor web decoder and retain channel 333 without a second model pass.')
parser.add_argument('--source',type=Path,required=True,help='Existing trufor-split-value model directory')
parser.add_argument('--output',type=Path,required=True,help='New trufor-neuron333 model directory')
args=parser.parse_args()
SOURCE=args.source.absolute()
manifest = json.loads((SOURCE / 'manifest.json').read_text())
asset = manifest['assets'][manifest['heads'][0]['fuse']]
path = (SOURCE / asset['file']).resolve()
assert hashlib.sha256(path.read_bytes()).hexdigest() == asset['sha256']
base = onnx.load(path)
pred = next(n for n in base.graph.node if 'result' in n.output)
assert pred.op_type == 'Conv', pred.op_type
activation = pred.input[0]
relu = next(n for n in base.graph.node if activation in n.output)
assert relu.op_type == 'Relu', relu.op_type
out = args.output.absolute(); out.mkdir(parents=True,exist_ok=True)
records = {}
for mode in ['fused']:
    graph = onnx.ModelProto(); graph.CopyFrom(base)
    if mode != 'fused':
      graph.graph.initializer.extend([
        numpy_helper.from_array(np.array([333], dtype=np.int64), 'capture333_start'),
        numpy_helper.from_array(np.array([334], dtype=np.int64), 'capture333_stop'),
        numpy_helper.from_array(np.array([1], dtype=np.int64), 'capture333_axis'),
      ])
      graph.graph.node.append(helper.make_node('Slice', [activation, 'capture333_start', 'capture333_stop', 'capture333_axis'], ['neuron333_activation']))
    if mode == 'fused':
        # The last 1x1 convolution already reads all 512 activations. Append
        # an identity row for channel 333 to the two unchanged learned rows.
        prediction = next(n for n in graph.graph.node if 'result' in n.output)
        for name in prediction.input[1:]:
            parameter = next(t for t in graph.graph.initializer if t.name == name)
            array = numpy_helper.to_array(parameter).copy()
            extra = np.zeros((1, *array.shape[1:]), dtype=array.dtype)
            if array.ndim == 4:
                assert array.shape == (2, 512, 1, 1)
                extra[0, 333, 0, 0] = 1
            else:
                assert array.shape == (2,)
            parameter.CopyFrom(numpy_helper.from_array(np.concatenate([array, extra]), name))
        graph.graph.output[0].type.tensor_type.shape.dim[1].dim_value = 3
    elif mode == 'packed':
        prediction = next(n for n in graph.graph.node if 'result' in n.output)
        prediction.output[0] = 'native_logits'
        graph.graph.node.append(helper.make_node('Concat', ['native_logits', 'neuron333_activation'], ['result'], axis=1))
        graph.graph.output[0].type.tensor_type.shape.dim[1].dim_value = 3
    else:
        graph.graph.output.append(helper.make_tensor_value_info('neuron333_activation', onnx.TensorProto.FLOAT, [1, 1, 'capture_h', 'capture_w']))
    onnx.checker.check_model(graph)
    target = out / ('decode-head-333-' + mode + '.onnx'); onnx.save(graph, target)
    # Original parameters and native nodes are byte-identical, except the
    # prediction's output name in the packed transport variant.
    for old,new in zip(base.graph.initializer,graph.graph.initializer):
        if mode == 'fused' and old.name in pred.input[1:]:
            assert np.array_equal(numpy_helper.to_array(old),numpy_helper.to_array(new)[:2])
        else:
            assert old.SerializeToString() == new.SerializeToString()
    records[mode] = {'file': target.name, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'graphOptimizationLevel': 'disabled'}
    m = json.loads(json.dumps(manifest))
    # Unchanged artifacts keep their original URL; only this head is private.
    for key, a in m['assets'].items():
        a['url'] = '/assets/individual-assets/trufor-split-value/' + a['file']
    head = m['heads'][0]
    m['assets'][head['fuse']] = {**records[mode], 'url': '/models/' + target.name}
    head['neuron333'] = {'schema': 1, 'transport': mode, 'index': 333, 'layer': 'decode_head.linear_fuse', 'activation': 'post-ReLU', 'coefficient': 2.834346325108858, 'bias': -4.3996579849141835}
    (out / ('manifest-' + mode + '.json')).write_text(json.dumps(m, indent=2) + '\n')
(out / 'provenance.json').write_text(json.dumps({'sourceGraph': path.name, 'sourceSha256': asset['sha256'], 'activationValue': activation, 'learnedParametersUnchanged': True, 'variants': records}, indent=2) + '\n')
print(json.dumps(records))

# Join the unchanged decoder operators so intermediate 512-channel projections
# stay in the runtime instead of making eight GPU -> CPU -> GPU round trips.
# Graph optimization remains disabled; no folding or arithmetic rewrite.
nodes, initializers, inputs = [], [], []
opsets = dict((o.domain, o.version) for o in base.opset_import)
def inline(source, prefix, bindings, output_bindings):
    source=source.resolve()
    expected=next((a['sha256'] for a in manifest['assets'].values() if (SOURCE/a['file']).resolve()==source),None)
    if expected is not None: assert hashlib.sha256(source.read_bytes()).hexdigest()==expected, 'Original decoder graph identity differs'
    graph = onnx.load(source)
    names = {**bindings, **output_bindings}
    def rename(value):
        if not value: return value
        return names.setdefault(value, prefix + value)
    for value in graph.graph.initializer:
        t = onnx.TensorProto(); t.CopyFrom(value); t.name = rename(t.name); initializers.append(t)
    for original in graph.graph.node:
        n = onnx.NodeProto(); n.CopyFrom(original)
        n.name = prefix + n.name
        for i, v in enumerate(n.input): n.input[i] = rename(v)
        for i, v in enumerate(n.output): n.output[i] = rename(v)
        nodes.append(n)
    for o in graph.opset_import: opsets[o.domain] = max(opsets.get(o.domain, 0), o.version)
    return graph
for i,c in enumerate([64,128,320,512],1):
    inputs.append(helper.make_tensor_value_info('feature'+str(i),onnx.TensorProto.FLOAT,[1,c,'f'+str(i)+'h','f'+str(i)+'w']))
    if i>1: inputs.append(helper.make_tensor_value_info('grid'+str(i),onnx.TensorProto.FLOAT,[1,'rows','width',2]))
for hi, head in enumerate(manifest['heads']):
    for i, key in enumerate(head['projects'],1):
        inline((SOURCE/manifest['assets'][key]['file']).resolve(),f'h{hi}p{i}/',{'x':'feature'+str(i),**({'grid':'grid'+str(i)} if i>1 else {})},{'result':f'h{hi}c{i}'})
    inline(out/'decode-head-333-fused.onnx' if hi==0 else (SOURCE/manifest['assets'][head['fuse']]['file']).resolve(),f'h{hi}f/',{f'c{i}':f'h{hi}c{i}' for i in range(1,5)},{'result':'localization_and_333' if hi==0 else 'confidence_logits'})
nodes.append(helper.make_node('Concat',['localization_and_333','confidence_logits'],['result'],axis=1))
graph=helper.make_graph(nodes,'TruFor exact decoder window with diagnostic channel',inputs,[helper.make_tensor_value_info('result',onnx.TensorProto.FLOAT,[1,4,'rows','width'])],initializers)
model=helper.make_model(graph,opset_imports=[helper.make_opsetid(k,v) for k,v in opsets.items()]);model.ir_version=base.ir_version
onnx.checker.check_model(model);file=out/'decode-window-333.onnx';onnx.save(model,file)
m=json.loads((out/'manifest-fused.json').read_text());key='decode-window333'
m['assets'][key]={'file':file.name,'url':'/models/'+file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'graphOptimizationLevel':'disabled'}
m['decoderWindow']={'schema':1,'graph':key,'channels':4,'layout':['logit0','logit1','activation333','confidenceLogit']}
(out/'manifest-joint.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'joint':m['assets'][key],'nodes':len(nodes)}))

# Public build manifests contain relative asset references and hashes only.
for item in m['assets'].values():
    source=(out/item['file']) if item.get('url','').startswith('/models/') else (SOURCE/item['file'])
    item['file']=os.path.relpath(source.absolute(),out)
    item.pop('url',None)
for case in m.get('cases',[]):
    for item in case.get('files',{}).values():
        item['file']=os.path.relpath((SOURCE/item['file']).absolute(),out)
m['implementation']='Joined original decoder; retained channel 333; no input resampling or second network execution'
(out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
for file in ['manifest-fused.json','manifest-joint.json']:
    (out/file).unlink(missing_ok=True)
