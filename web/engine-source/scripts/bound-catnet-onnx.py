"""Splice native DCT/head row loops into the already exported full CAT-Net."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import numpy as np
import torch,onnx
from onnx import helper as h
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core import catnet
spec=importlib.util.spec_from_file_location('catnet_bounded',root/'scripts/catnet-bounded-modules.py');module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
out=root/'.build/catnet';torch.set_num_threads(2);model=catnet.load('cpu');model.memory_bounded=True
parts=[('dct',torch.jit.script(module.DctRows(model.dc_layer0_dil,model.dc_layer1_tail)),(torch.zeros(1,21,64,96),),['coeff']),('head',torch.jit.script(module.HeadRows(model.last_layer)),tuple(torch.zeros(1,c,64//2**i,96//2**i) for i,c in enumerate([24,48,96,192])),['f0','f1','f2','f3'])]
# Read actual last-layer channels from the native stage, rather than infer model specs.
print(model.last_layer,flush=True)
# Native stage5 channels are [24,48,96,192] (360 channels at the classifier).
for name,part,args,inputs in parts:
 path=out/f'{name}-rows.onnx'
 with torch.inference_mode():torch.onnx.export(part,args,path,input_names=inputs,output_names=['result'],opset_version=19,dynamo=False,external_data=False,dynamic_axes={k:{2:'h'+str(i),3:'w'+str(i)} for i,k in enumerate(inputs)}|{'result':{2:'h',3:'w'}})
 print('Exported',name,flush=True)
m=onnx.load(out/'catnet.onnx');g=m.graph;prod={o:n for n in g.node for o in n.output};cons={}
for n in g.node:
 for x in n.input:cons.setdefault(x,[]).append(n)
removed=set();replacements={}
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
dct=[n for n in g.node if n.name.startswith('/model/dc_layer0_dil/') or n.name.startswith('/model/dc_layer1_tail/')]
assert dct[0].op_type=='Conv' and dct[-1].op_type=='Relu'
replacements[dct[-1].name]=fragment('dct-rows.onnx',[dct[0].input[0]],dct[-1].output[0],'bounded_dct/');removed.update(n.name for n in dct)
head=[n for n in g.node if n.name.startswith('/model/last_layer/')];joined=prod[head[0].input[0]];assert joined.op_type=='Concat'
features=[joined.input[0]]+[prod[x].input[0] for x in joined.input[1:]]
replacements[head[-1].name]=fragment('head-rows.onnx',features,head[-1].output[0],'bounded_head/');removed.update(n.name for n in [joined,*head])
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
  for attribute in node.attribute:
   if attribute.type==onnx.AttributeProto.GRAPH:required.update(captures(attribute.g))
del g.node[:];g.node.extend(reversed(kept));initializers=[x for x in g.initializer if x.name in required];del g.initializer[:];g.initializer.extend(initializers)
onnx.checker.check_model(m);path=out/'catnet-bounded.onnx';onnx.save(m,path)
reference=json.loads((out/'reference.json').read_text());cases=[]
for index,(height,width) in enumerate([(64,96),(97,131),(264,64)]):
 jpeg=out/f'bounded-case-{index}.jpg';Image.fromarray(np.random.default_rng(218+index).integers(0,256,(height,width,3),dtype=np.uint8)).save(jpeg,quality=90,subsampling=2)
 image,table,meta=catnet.prepare(jpeg)
 with torch.inference_mode():
  logits=model(image,table);prob=torch.softmax(logits[0],dim=0)[1];full=torch.nn.functional.interpolate(prob[None,None],size=image.shape[-2:],mode='bilinear',align_corners=False)[0,0]
 files={}
 for name,value in [('image',image),('table',table),('native_map',prob),('padded_map',full)]:
  file=f'bounded-case-{index}-{name}.f32';value.numpy().astype('<f4').tofile(out/file);files[name]=dict(file=file,shape=list(value.shape))
 cases.append(dict(id=index,jpeg=jpeg.name,metadata=meta,files=files))
reference.update(memoryBounded=True,preferredLayout='NCHW',file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=cases)
(out/'bounded-reference.json').write_text(json.dumps(reference,separators=(',',':'))+'\n');print('Bounded CAT-Net complete',flush=True)
