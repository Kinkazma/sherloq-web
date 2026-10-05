"""Offline native inference BN arithmetic, reused from qualified D2PRL work.

No activation fitting: constants depend solely on checkpoint BN parameters.
The resulting network still needs its own end-to-end decision comparison.
"""
from pathlib import Path
import ctypes as C, ctypes.util, hashlib, json, sys
import numpy as np
import onnx
from onnx import helper as H, numpy_helper as N

root = Path(__file__).resolve().parents[1]
variant = sys.argv[1]
assert variant in ('mgcfdn', 'mgcfdn-st', 'mgcfdn-16', 'mgcfdn-effnet', 'mgcfdn-mpdn', 'mgcfdn-tnt')
base = root / '.build/segmentation-models' / variant
source = base / 'unfolded.onnx'
model = onnx.load(source)
values = {v.name: N.to_array(v) for v in model.graph.initializer}
aliases = {n.output[0]: n.input[0] for n in model.graph.node if n.op_type == 'Identity'}
lib = C.CDLL(ctypes.util.find_library('m'))
lib.fmaf.argtypes = [C.c_float, C.c_float, C.c_float]
lib.fmaf.restype = C.c_float
def resolve(name):
    while name in aliases:
        name = aliases[name]
    return np.asarray(values[name], np.float32)
nodes, count = [], 0
for item in model.graph.node:
    if item.op_type != 'BatchNormalization':
        nodes.append(item)
        continue
    attrs = {a.name: H.get_attribute_value(a) for a in item.attribute}
    assert len(item.output) == 1 and attrs.get('training_mode', 0) == 0
    weight, bias, mean, variance = [resolve(n) for n in item.input[1:]]
    eps = np.float32(attrs.get('epsilon', 1e-5))
    inv = np.float32(1) / np.sqrt(variance + eps)
    alpha = weight * inv
    beta = np.array([lib.fmaf(-float(m), float(a), float(b)) for m, a, b in zip(mean, alpha, bias)], np.float32)
    prefix = 'native_bn_' + str(count) + '_'
    an, bn = prefix + 'alpha', prefix + 'beta'
    # All source modules in these variants are BatchNorm2d (NCHW).
    model.graph.initializer.extend([N.from_array(alpha.reshape(1, -1, 1, 1), an), N.from_array(beta.reshape(1, -1, 1, 1), bn)])
    nodes.extend([H.make_node('Mul', [item.input[0], an], [prefix + 'product'], name=prefix + 'mul'), H.make_node('Add', [prefix + 'product', bn], list(item.output), name=prefix + 'add')])
    count += 1
model.graph.ClearField('node')
model.graph.node.extend(nodes)
onnx.checker.check_model(model)
target = base / 'native-bn.onnx'
onnx.save(model, target)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = dict(schema=1, status='unqualified-arithmetic-candidate', variant=variant, sourceSha256=sha(source), model=dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target)), batchnormNodes=count, recipe='Float32 native alpha/beta with fused bias preparation and separate runtime Mul/Add; no fitted activation', scriptSha256=sha(Path(__file__)))
(base / 'native-bn.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
