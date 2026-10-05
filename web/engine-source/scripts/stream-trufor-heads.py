"""Bound both complete TruFor decoder heads and accept the native-order NPP field."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import torch,onnx
from onnx import helper as h,TensorProto as T
root=Path(__file__).resolve().parents[1];out=root/'.build/trufor-streamed';out.mkdir(exist_ok=True)
native=root.parent/'source/gui/TruFor_main/test_docker';sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
spec=importlib.util.spec_from_file_location('trufor_bounded',root/'scripts/trufor-bounded-modules.py');module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
torch.set_num_threads(2);cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze();model=myEncoderDecoder(cfg=cfg);model.load_state_dict(torch.load(native/'weights/trufor-state.pt',map_location='cpu',weights_only=True)['state_dict']);model.eval()
inputs=['c1','c2','c3','c4','row_budget'];args=tuple(torch.zeros(1,c,16//2**i,24//2**i) for i,c in enumerate([64,128,320,512]))+(torch.tensor(8192,dtype=torch.int64),)
for name in ['decode_head','decode_head_conf']:
 with torch.inference_mode():torch.onnx.export(torch.jit.script(module.HeadRows(getattr(model,name))),args,out/(name+'.onnx'),input_names=inputs,output_names=['result'],opset_version=19,dynamo=False,external_data=False,do_constant_folding=False,dynamic_axes={k:{2:'h'+str(i),3:'w'+str(i)} for i,k in enumerate(inputs[:4])}|{'result':{2:'h',3:'w'}})
m=onnx.load(root/'.build/trufor-unfused/trufor-bounded.onnx');g=m.graph;prod={o:n for n in g.node for o in n.output};removed=set();replacements={}
def fragment(file,inputs,output,prefix):
 f=onnx.load(out/file);mapping={item.name:value for item,value in zip(f.graph.input,inputs)};mapping[f.graph.output[0].name]=output
 def rename(value):return mapping.get(value,prefix+value) if value else value
 def walk(graph):
  for n in graph.node:
   n.name=prefix+n.name
   for i,x in enumerate(n.input):n.input[i]=rename(x)
   for i,x in enumerate(n.output):n.output[i]=rename(x)
   for a in n.attribute:
    if a.type==onnx.AttributeProto.GRAPH:walk(a.g)
  for item in [*graph.input,*graph.output,*graph.value_info,*graph.initializer]:item.name=rename(item.name)
 walk(f.graph);g.initializer.extend(f.graph.initializer);return list(f.graph.node)
for i,name in enumerate(['decode_head','decode_head_conf']):
 features=[]
 for c in range(1,5):
  linear=next(n for n in g.node if n.name==f'/model/{name}/linear_c{c}/proj/MatMul');reshape=prod[prod[linear.input[0]].input[0]];assert reshape.op_type=='Reshape';features.append(reshape.input[0])
 end=next(n for n in g.node if n.op_type=='ConcatFromSequence' and n.name==f'bounded_fusion_{i}/concat')
 replacements[end.name]=fragment(name+'.onnx',features+['fusion_budget'],end.output[0],f'streamed_{name}/');removed.add(end.name)
last=next(n for n in g.node if n.name=='/model/dncnn/dncnn.47/Conv');npp=last.output[0]
g.input.append(h.make_tensor_value_info('native_noiseprint',T.FLOAT,[1,1,'h','w']));replacements[last.name]=[h.make_node('Identity',['native_noiseprint'],[npp],name='native_noiseprint_input')];removed.add(last.name)
nodes=[]
for n in g.node:
 if n.name in replacements:nodes.extend(replacements[n.name])
 elif n.name not in removed:nodes.append(n)
del g.node[:];g.node.extend(nodes)
def captures(graph):
 defined={x.name for x in [*graph.input,*graph.initializer]}
 for node in graph.node:defined.update(node.output)
 used=set()
 for node in graph.node:
  used.update(x for x in node.input if x)
  for attribute in node.attribute:
   if attribute.type==onnx.AttributeProto.GRAPH:used.update(captures(attribute.g))
 return used-defined
required={x.name for x in g.output};kept=[]
for node in reversed(g.node):
 if required.intersection(node.output):
  kept.append(node);required.update(x for x in node.input if x)
  for a in node.attribute:
   if a.type==onnx.AttributeProto.GRAPH:required.update(captures(a.g))
del g.node[:];g.node.extend(reversed(kept));initializers=[x for x in g.initializer if x.name in required];del g.initializer[:];g.initializer.extend(initializers)
# ORT WebGPU does not ship a double Cast kernel; fold only literal constants.
# No weight, activation or floating-point expression is optimized here.
def literal_casts(graph,inherited=None):
 constants=dict(inherited or {})
 for node in graph.node:
  if node.op_type=='Constant':
   tensor=next((a.t for a in node.attribute if a.name=='value'),None)
   if tensor is not None:constants[node.output[0]]=onnx.numpy_helper.to_array(tensor)
  elif node.op_type=='Cast' and node.input[0] in constants:
   typ=next(a.i for a in node.attribute if a.name=='to');value=constants[node.input[0]].astype(h.tensor_dtype_to_np_dtype(typ));constants[node.output[0]]=value
   node.CopyFrom(h.make_node('Constant',[],list(node.output),name=node.name,value=onnx.numpy_helper.from_array(value)))
  for attr in node.attribute:
   if attr.type==onnx.AttributeProto.GRAPH:literal_casts(attr.g,constants)
literal_casts(g)
onnx.checker.check_model(m);path=out/'trufor-native-npp.onnx';onnx.save(m,path)
r=json.loads((root/'.build/trufor-unfused/bounded-reference.json').read_text());r.update(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),externalNoiseprint=True,streamedHeads=2,referenceDirectory='../trufor-unfused/')
(out/'native-reference.json').write_text(json.dumps(r,separators=(',',':'))+'\n');print(r['sha256'])
