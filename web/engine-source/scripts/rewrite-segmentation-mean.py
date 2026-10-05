"""Reuse native cascade global means in fixed MGCF graphs, without fitting.

Only geometry is captured. An unchanged native forward must reproduce the
stored logits before its pool call order can guide an offline graph rewrite.
"""
from pathlib import Path
import argparse, ast, hashlib, json, sys
import numpy as np
import torch
import onnx
from onnx import helper as H, numpy_helper as N, TensorProto as T

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
parser = argparse.ArgumentParser()
parser.add_argument('variant', choices=['mgcfdn-effnet', 'mgcfdn-st', 'mgcfdn-tnt', 'mgcfdn-vig'])
parser.add_argument('--base', default='unfolded', choices=['unfolded', 'native-bn', 'native-resize', 'native-bn-resize'])
args = parser.parse_args()
base = root / '.build/segmentation-models' / args.variant
reference = json.loads((base / 'reference.json').read_text())
torch.set_num_threads(reference['referenceThreads'])
loaded = load_segmentation(reference['variant'], 'cpu')
row = reference['records'][-1]
data = (base / row['input']['file']).read_bytes()
assert hashlib.sha256(data).hexdigest() == row['input']['sha256']
tensor = torch.from_numpy(np.frombuffer(data, np.float32).copy().reshape(row['input']['shape']))
calls, handles, outer_units = [], [], []
def record(name):
    def hook(module, inputs, output):
        value, = inputs
        assert value.dtype == torch.float32 and value.ndim == 4
        assert value.is_contiguous() or value.is_contiguous(memory_format=torch.channels_last)
        assert list(output.shape) == [1, value.shape[1], 1, 1]
        layout = 'nchw' if value.is_contiguous() else 'channels-last'
        calls.append(dict(module=name, input=list(value.shape), output=list(output.shape), layout=layout))
        if layout == 'channels-last':
            outer_units.append((name, value.contiguous().numpy().copy(), output.numpy().copy()))
    return hook
for name, module in loaded['model'].named_modules():
    if isinstance(module, torch.nn.AdaptiveAvgPool2d):
        handles.append(module.register_forward_hook(record(name)))
try:
    with torch.inference_mode():
        logits = loaded['model'](tensor)
    assert hashlib.sha256(logits.numpy().tobytes()).hexdigest() == row['logits']['sha256'], 'Native reference changed'
finally:
    for handle in handles:
        handle.remove()

source = root / 'scripts/rewrite-d2prl-mean.py'
parsed = ast.parse(source.read_text().replace('plane<=224*224', 'plane<=256*256'))
definitions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == 'rewrite']
assert len(definitions) == 1
namespace = dict(np=np, H=H, N=N, T=T)
exec(compile(ast.Module(body=definitions, type_ignores=[]), source.name, 'exec'), namespace)
rewrite = namespace['rewrite']

def rewrite_outer(input_name, output_name, c, h, w, prefix):
    # Torch2.8 SumKernel::vectorized_outer_sum invokes multi_row_sum across
    # spatial positions for complete blocks of16 channels. It does not use
    # the four interleaved spatial accumulators of vectorized_inner_sum.
    plane = h*w
    assert c % 16 == 0 and 0 < plane < 16**4
    nodes, constants, serial = [], [], 0
    def const(value):
        nonlocal serial
        serial += 1; name = prefix + 'constant_' + str(serial)
        constants.append(N.from_array(np.asarray(value), name)); return name
    def node(op, inputs, **attrs):
        nonlocal serial
        serial += 1; name = prefix + op + '_' + str(serial)
        nodes.append(H.make_node(op, inputs, [name], name=name, **attrs)); return name
    def shape(value, dims): return node('Reshape', [value, const(np.array(dims, np.int64))])
    def zero(dims): return node('ConstantOfShape', [const(np.array(dims, np.int64))], value=N.from_array(np.array([0], np.float32)))
    def gather(value, index, axis): return node('Gather', [value, const(np.array(index, np.int64))], axis=axis)
    value = shape(input_name, [1, c, plane]); count = plane; partials = []
    for level in range(4):
        chunks, tail = divmod(count, 16); partial = zero([1, c])
        for i in range(tail): partial = node('Add', [partial, gather(value, chunks*16+i, 2)])
        partials.append(partial)
        if chunks:
            first = node('Slice', [value, const(np.array([0], np.int64)), const(np.array([chunks*16], np.int64)), const(np.array([2], np.int64))])
            block = shape(first, [1, c, chunks, 16]); value = zero([1, c, chunks])
            for i in range(16): value = node('Add', [value, gather(block, i, 3)])
        count = chunks
    assert count == 0
    total = partials[0]
    for partial in partials[1:]: total = node('Add', [total, partial])
    mean = node('Div', [total, const(np.array(plane, np.float32))])
    output = shape(mean, [1, c, 1, 1])
    nodes.append(H.make_node('Identity', [output], [output_name], name=prefix+'output'))
    return nodes, constants

input_path = base / (args.base + '.onnx')
model = onnx.load(input_path)
nodes, count = [], 0
for item in model.graph.node:
    if item.op_type != 'GlobalAveragePool':
        nodes.append(item)
        continue
    call = calls[count]
    assert item.name.split('/')[-2].split('.')[-1] == call['module'].split('.')[-1], 'Pool identity/order'
    batch, c, h, w = call['input']
    assert batch == 1 and h*w <= 256**2
    rewriter = rewrite if call['layout'] == 'nchw' else rewrite_outer
    replacement, constants = rewriter(item.input[0], item.output[0], c, h, w, 'native_seg_mean_' + str(count) + '_')
    nodes.extend(replacement)
    model.graph.initializer.extend(constants)
    count += 1
assert count == len(calls) and count > 0
model.graph.ClearField('node')
model.graph.node.extend(nodes)
onnx.checker.check_model(model)
name = 'native-mean' if args.base == 'unfolded' else args.base + '-mean'
target = base / (name + '.onnx')
onnx.save(model, target)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
unit_records = []
if outer_units:
    rng = np.random.default_rng(5617)
    for side in [15, 16, 31]:
        array = rng.normal(size=(1, 32, side, side)).astype(np.float32)
        value = torch.from_numpy(array).contiguous(memory_format=torch.channels_last)
        outer_units.append(('generated-'+str(side), array, torch.nn.functional.adaptive_avg_pool2d(value, 1).numpy()))
    def save(name, array):
        array = np.ascontiguousarray(array); target = base / name
        target.write_bytes(array.tobytes())
        return dict(file=name, bytes=target.stat().st_size, sha256=sha(target), shape=list(array.shape))
    for i, (label, array, output) in enumerate(outer_units):
        _, c, h, w = array.shape
        unit_nodes, unit_constants = rewrite_outer('input', 'output', c, h, w, 'outer_')
        graph = H.make_graph(unit_nodes, 'native-outer-mean', [H.make_tensor_value_info('input', T.FLOAT, list(array.shape))], [H.make_tensor_value_info('output', T.FLOAT, list(output.shape))], unit_constants)
        unit = H.make_model(graph, opset_imports=[H.make_opsetid('', 18)], ir_version=10)
        onnx.checker.check_model(unit); path = base / ('outer-mean-'+str(i)+'.onnx'); onnx.save(unit, path)
        unit_records.append(dict(name=label, model=dict(file=path.name, bytes=path.stat().st_size, sha256=sha(path)), input=save('outer-mean-'+str(i)+'-input.bin', array), output=save('outer-mean-'+str(i)+'-output.bin', output)))
    (base/'outer-mean-reference.json').write_text(json.dumps(dict(schema=1, records=unit_records), indent=2)+'\n')
report = dict(schema=1, status='unqualified-arithmetic-candidate', variant=args.variant,
              model=dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target)),
              sourceSha256=sha(input_path), meanNodes=count, geometry=calls,
              meanSourceSha256=sha(source), nativeLogitsSha256=row['logits']['sha256'],
              recipe='Native four-lane cascade reduction and float32 division, unchanged fixed shapes and weights',
              scriptSha256=sha(Path(__file__)))
target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['status', 'variant', 'meanNodes', 'model']}), flush=True)
