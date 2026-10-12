import argparse,pathlib,sys,json,hashlib,time
import onnx,numpy as np
from onnx import numpy_helper
from onnx.reference import ReferenceEvaluator
parser=argparse.ArgumentParser(description='Evaluate static ONNX literals exactly; preserve learned initializers and dynamic operations')
parser.add_argument('input_directory',type=pathlib.Path)
parser.add_argument('output_directory',type=pathlib.Path)
args=parser.parse_args();args.output_directory.mkdir(parents=True,exist_ok=True)
r=args.input_directory.resolve();outputRoot=args.output_directory.resolve()
whitelist={'Constant','Cast','Identity','Unsqueeze','Squeeze','Reshape','Concat','Transpose','Slice','Gather','Add','Sub','Mul','Div','Range','ConstantOfShape','Shape','Size'}
def folded(graph,opset,outer=None):
 values=dict(outer or {});values.update({x.name:numpy_helper.to_array(x) for x in graph.initializer});kept=[];added=[];count=0
 for node in graph.node:
  for attr in node.attribute:
   if attr.type==onnx.AttributeProto.GRAPH:count+=folded(attr.g,opset,values)
   elif attr.type==onnx.AttributeProto.GRAPHS:
    for g in attr.graphs:count+=folded(g,opset,values)
  if node.domain in ['', 'ai.onnx'] and node.op_type in whitelist and all(not name or name in values for name in node.input):
   try:
    actual=ReferenceEvaluator(node,opsets={'':opset}).run(None,{name:values[name] for name in node.input if name})
    for name,value in zip(node.output,actual):
     value=np.asarray(value);values[name]=value;added.append(numpy_helper.from_array(value,name))
    count+=1;continue
   except Exception:pass
  kept.append(node)
 del graph.node[:];graph.node.extend(kept);graph.initializer.extend(added);return count
record={'schema':1,'scope':'Exact static ONNX subgraph evaluation to bypass unassigned Constant-Cast provider bug; no learned weight or dynamic arithmetic change','records':[]}
for original,output in [('superpoint-full.onnx','superpoint-static-folded.onnx'),('convcrf-vectorized-dynamic.onnx','convcrf-static-folded-if.onnx')]:
 source=r/original;model=onnx.load(source);opset=next(v.version for v in model.opset_import if v.domain=='');count=folded(model.graph,opset);target=outputRoot/output;onnx.checker.check_model(model,full_check=True);onnx.save(model,target)
 record['records'].append({'source':original,'file':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'foldedNodes':count,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(outputRoot/'static-folded-models.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
