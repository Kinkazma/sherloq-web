"""Optional faithful GPU query graphs; retain original graphs for CPU/small keys.

Writes only M2 build artifacts. The original segment manifest/assets are inputs.
"""
from pathlib import Path
import sys,importlib.util,json,hashlib
import torch,onnx
from onnx import numpy_helper
root=Path(__file__).resolve().parents[1];base=root/'.build/trufor-segments';out=root/'.build/trufor-split-value';out.mkdir(exist_ok=True)
native=root.parent/'source/gui/TruFor_main/test_docker';sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
spec=importlib.util.spec_from_file_location('segment_modules',root/'scripts/trufor-segment-modules.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
torch.set_num_threads(2);cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze();model=myEncoderDecoder(cfg=cfg);weights=native/'weights/trufor-state.pt';model.load_state_dict(torch.load(weights,map_location='cpu',weights_only=True)['state_dict']);model.eval()
manifest=json.loads((base/'manifest.json').read_text())
assert manifest['checkpointSha256']==hashlib.sha256(weights.read_bytes()).hexdigest()
for asset in manifest['assets'].values():asset['file']='../trufor-segments/'+asset['file']
for case in manifest['cases']:
 for f in case['files'].values():f['file']='../trufor-segments/'+f['file']
with torch.inference_mode():
 for stage,entry in enumerate(manifest['stages'],1):
  c=entry['channels']
  for branch,stream in zip(['','extra_'],entry['streams']):
   for block,description in zip(getattr(model.backbone,branch+'block'+str(stage)),stream['blocks']):
    heads=block.attn.num_heads
    if heads>5 and '--all-candidates' not in sys.argv:continue
    name=description['query']+'-split-value';path=out/(name+'.onnx');d=c//heads
    torch.onnx.export(m.QueryWindowSplitValue(block),(torch.zeros(1,c,1,3),torch.zeros(1,heads,d,1031),torch.zeros(1,heads,1031,d)),path,input_names=['x','key','value'],output_names=['result'],opset_version=19,dynamo=False,external_data=False,do_constant_folding=False,dynamic_axes={'x':{2:'h',3:'w'},'key':{3:'keys'},'value':{2:'keys'},'result':{2:'h',3:'w'}})
    # Same literal-only Cast folding as the original exporter.
    graph=onnx.load(path);values={t.name:numpy_helper.to_array(t) for t in graph.graph.initializer};nodes=[]
    for node in graph.graph.node:
     if node.op_type=='Constant':
      value=next((a.t for a in node.attribute if a.name=='value'),None)
      if value is not None:values[node.output[0]]=numpy_helper.to_array(value)
     if node.op_type=='Cast' and node.input[0] in values:
      typ=next(a.i for a in node.attribute if a.name=='to');array=values[node.input[0]].astype(onnx.helper.tensor_dtype_to_np_dtype(typ));values[node.output[0]]=array;graph.graph.initializer.append(numpy_helper.from_array(array,node.output[0]));continue
     nodes.append(node)
    del graph.graph.node[:];graph.graph.node.extend(nodes);onnx.checker.check_model(graph);onnx.save(graph,path)
    manifest['assets'][name]=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),graphOptimizationLevel='disabled')
    description['querySplitValue']=dict(name=name,chunkKeys=1024,minKeys=65536)
  print('exported stage',stage,flush=True)
manifest['splitValueScope']='Optional GPU P@V split reduction after unchanged full-key softmax; learned weights unchanged.'
(out/('all-candidates-manifest.json' if '--all-candidates' in sys.argv else 'manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
