"""Group wide Concats into ordered groups of at most seven inputs.

The eighth storage binding is the output, fitting the baseline WebGPU limit.
Concatenation copies values without arithmetic; channel and element order stay
unchanged. No scientific model parameters, tensor sizes or precision are changed.
"""
from pathlib import Path
import hashlib, json, sys
import onnx
from onnx import helper as H
root = Path(__file__).resolve().parents[1]
variant = sys.argv[1]
assert variant in ('mgcfdn-mpdn', 'mgcfdn', 'mgcfdn-16', 'mgcfdn-effnet', 'mgcfdn-st')
base = root / '.build/segmentation-models' / variant
source = base / 'unfolded.onnx'
model = onnx.load(source)
nodes, changes = [], []
for index, item in enumerate(model.graph.node):
    if item.op_type != 'Concat' or len(item.input) <= 7:
        nodes.append(item)
        continue
    attrs = {a.name:H.get_attribute_value(a) for a in item.attribute}
    assert set(attrs) == {'axis'} and len(item.output) == 1
    inputs, count, groups = list(item.input), 0, []
    while len(inputs) > 7:
        following = []
        for first in range(0, len(inputs), 7):
            chunk = inputs[first:first + 7]
            if len(chunk) == 1:
                following.extend(chunk)
                continue
            name = 'portable_concat_' + str(index) + '_' + str(count)
            count += 1
            nodes.append(H.make_node('Concat', chunk, [name], name=name, **attrs))
            following.append(name)
            groups.append(len(chunk))
        inputs = following
    nodes.append(H.make_node('Concat', inputs, list(item.output), name=item.name, **attrs))
    changes.append(dict(name=item.name, originalInputs=len(item.input), intermediateGroups=groups, finalInputs=len(inputs), axis=attrs['axis']))
model.graph.ClearField('node')
model.graph.node.extend(nodes)
onnx.checker.check_model(model)
target = base / 'gpu-concat.onnx'
onnx.save(model, target)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = dict(schema=1, variant=variant, status='unqualified-layout-candidate', sourceSha256=sha(source), model=dict(file=target.name,bytes=target.stat().st_size,sha256=sha(target)), maximumConcatInputs=7, maximumStorageBindings=8, changes=changes, scriptSha256=sha(Path(__file__)))
(base / 'gpu-concat.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
