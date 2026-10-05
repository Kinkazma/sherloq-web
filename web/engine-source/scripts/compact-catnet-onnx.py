"""Keep JPEG DCT codes compact and form the exact 21 bands only within row loops."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import torch,onnx
from onnx import helper as h,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));out=root/'.build/catnet'
from gui.sherloq_app.core import catnet
spec=importlib.util.spec_from_file_location('catnet_bounded',root/'scripts/catnet-bounded-modules.py');module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
torch.set_num_threads(2);model=catnet.load('cpu');part=torch.jit.script(module.DctCodesRows(model.dc_layer0_dil,model.dc_layer1_tail))
with torch.inference_mode():torch.onnx.export(part,(torch.zeros(1,1,64,96,dtype=torch.uint8),torch.tensor(96*512*32,dtype=torch.int64)),out/'dct-codes.onnx',input_names=['dct_codes','dct_budget'],output_names=['result'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={'dct_codes':{2:'h',3:'w'},'result':{2:'h',3:'w'}})
m=onnx.load(out/'catnet-bounded.onnx');g=m.graph;prod={o:n for n in g.node for o in n.output};end=next(n for n in g.node if n.op_type=='ConcatFromSequence' and n.name.startswith('bounded_dct/'))
f=onnx.load(out/'dct-codes.onnx');mapping={i.name:i.name for i in f.graph.input};mapping[f.graph.output[0].name]=end.output[0]
def rename(value):return mapping.get(value,'compact_dct/'+value) if value else value
def walk(graph):
 for n in graph.node:
  n.name='compact_dct/'+n.name
  for i,x in enumerate(n.input):n.input[i]=rename(x)
  for i,x in enumerate(n.output):n.output[i]=rename(x)
  for a in n.attribute:
   if a.type==onnx.AttributeProto.GRAPH:walk(a.g)
 for item in [*graph.input,*graph.output,*graph.value_info,*graph.initializer]:item.name=rename(item.name)
walk(f.graph);g.initializer.extend(f.graph.initializer);nodes=[]
for n in g.node:
 if n.name==end.name:nodes.extend(f.graph.node)
 else:nodes.append(n)
del g.node[:];g.node.extend(nodes)
# All ordinary RGB consumers already slice channels 0:3. Shape consumers need
# only spatial dimensions. The discarded 3:24 DCT slice is removed as dead code.
g.input[0].type.tensor_type.shape.dim[1].dim_value=3
g.input.extend([h.make_tensor_value_info('dct_codes',T.UINT8,[1,1,'h','w']),h.make_tensor_value_info('dct_budget',T.INT64,[])])
def captures(graph):
 defined={x.name for x in [*graph.input,*graph.initializer]};used=set()
 for node in graph.node:defined.update(node.output)
 for node in graph.node:
  used.update(x for x in node.input if x)
  for a in node.attribute:
   if a.type==onnx.AttributeProto.GRAPH:used.update(captures(a.g))
 return used-defined
required={x.name for x in g.output};kept=[]
for n in reversed(g.node):
 if required.intersection(n.output):
  kept.append(n);required.update(x for x in n.input if x)
  for a in n.attribute:
   if a.type==onnx.AttributeProto.GRAPH:required.update(captures(a.g))
del g.node[:];g.node.extend(reversed(kept));initializers=[x for x in g.initializer if x.name in required];del g.initializer[:];g.initializer.extend(initializers)
onnx.checker.check_model(m);target=out/'catnet-compact.onnx';onnx.save(m,target)
r=json.loads((out/'bounded-reference.json').read_text());r.update(file=target.name,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),compactDct=True,dctRowBudget=True)
(out/'compact-reference.json').write_text(json.dumps(r,separators=(',',':'))+'\n');print(r['sha256'])
