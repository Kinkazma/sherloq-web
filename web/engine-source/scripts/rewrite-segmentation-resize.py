"""Reuse D2PRL's qualified native bilinear arithmetic in fixed segmentation graphs.

Capture geometry from an unchanged native run. No activation or decision is used
as a replacement model input, correction or exported constant.
"""
from pathlib import Path
import ast, hashlib, json, sys, types
import numpy as np
import torch
import onnx
from onnx import helper as H, numpy_helper as N, TensorProto as T

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
variant = sys.argv[1]
assert variant in ('mgcfdn', 'mgcfdn-st', 'mgcfdn-16', 'mgcfdn-effnet', 'mgcfdn-mpdn')
base = root / '.build/segmentation-models' / variant
reference = json.loads((base / 'reference.json').read_text())
torch.set_num_threads(8)
loaded = load_segmentation(reference['variant'], 'cpu')
row = reference['records'][-1]
data = (base / row['input']['file']).read_bytes()
assert hashlib.sha256(data).hexdigest() == row['input']['sha256']
tensor = torch.from_numpy(np.frombuffer(data, np.float32).copy().reshape(row['input']['shape']))
calls = []
original = torch.nn.functional.interpolate
def capture(value, *args, **kwargs):
    output = original(value, *args, **kwargs)
    assert value.dtype == torch.float32 and value.is_contiguous() and value.ndim == 4
    calls.append(dict(input=list(value.shape), output=list(output.shape), mode=kwargs.get('mode', 'nearest'), alignCorners=kwargs.get('align_corners')))
    return output
torch.nn.functional.interpolate = capture
try:
    with torch.inference_mode():
        logits = loaded['model'](tensor)
    assert hashlib.sha256(logits.numpy().tobytes()).hexdigest() == row['logits']['sha256']
finally:
    torch.nn.functional.interpolate = original

# Load only the existing pure function definitions. The older development
# scripts contain top-level D2PRL fixture generation, which must not be rerun.
def existing_rewriter(filename, **extra):
    path = root / 'scripts' / filename
    parsed = ast.parse(path.read_text())
    functions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name == 'rewrite']
    assert len(functions) == 1
    namespace = dict(np=np, H=H, N=N, T=T, **extra)
    exec(compile(ast.Module(body=functions, type_ignores=[]), filename, 'exec'), namespace)
    return namespace['rewrite']
large = existing_rewriter('rewrite-d2prl-feature-resize.py')
small = existing_rewriter('rewrite-d2prl-head-resize.py', large=types.SimpleNamespace(rewrite=large))
source = base / ('native-bn.onnx' if '--bn' in sys.argv else 'unfolded.onnx')
model = onnx.load(source)
nodes, count, rewritten = [], 0, 0
for item in model.graph.node:
    if item.op_type != 'Resize':
        nodes.append(item)
        continue
    call = calls[count]
    count += 1
    attrs = {a.name: H.get_attribute_value(a) for a in item.attribute}
    if call['mode'] != 'bilinear' or call['alignCorners'] is not True:
        # ASPP's 1x1 -> grid is native half-pixel and stays unchanged here.
        assert call['mode'] == 'bilinear' and call['input'][2:] == [1, 1]
        nodes.append(item)
        continue
    assert attrs['mode'] == b'linear' and attrs['coordinate_transformation_mode'] == b'align_corners'
    _, c, ih, iw = call['input']
    _, oc, oh, ow = call['output']
    assert c == oc
    replacement, constants = small(item.input[0], item.output[0], c, ih, iw, oh, ow, 'native_seg_resize_' + str(count) + '_')
    nodes.extend(replacement)
    model.graph.initializer.extend(constants)
    rewritten += 1
assert count == len(calls)
model.graph.ClearField('node')
model.graph.node.extend(nodes)
onnx.checker.check_model(model)
target = base / ('native-bn-resize.onnx' if '--bn' in sys.argv else 'native-resize.onnx')
onnx.save(model, target)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = dict(schema=1, status='unqualified-arithmetic-candidate', variant=variant, sourceSha256=sha(source), model=dict(file=target.name, bytes=target.stat().st_size, sha256=sha(target)), resizeNodes=count, rewritten=rewritten, geometry=calls, reusedFunctions={name:sha(root / 'scripts' / name) for name in ['rewrite-d2prl-feature-resize.py', 'rewrite-d2prl-head-resize.py']}, scriptSha256=sha(Path(__file__)))
target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
