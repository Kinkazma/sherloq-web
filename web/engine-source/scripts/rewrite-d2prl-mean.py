"""Fixed-shape ONNX cascade reductions with the native float32 addition order."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';fixtures=root/'.build/d2prl-mean'
def rewrite(input_name,output_name,c,h,w,prefix):
 plane=h*w;vectors=plane//4;groups=vectors//4;assert plane<=224*224 and groups<16**4
 nodes=[];initializers=[];serial=0
 def constant(value):
  nonlocal serial
  serial+=1;name=prefix+'constant_'+str(serial);initializers.append(N.from_array(np.asarray(value),name));return name
 def node(op,args,**attrs):
  nonlocal serial
  serial+=1;name=prefix+op+'_'+str(serial);nodes.append(H.make_node(op,args,[name],name=name,**attrs));return name
 def shape(value,dims):return node('Reshape',[value,constant(np.array(dims,np.int64))])
 def zero(dims):return node('ConstantOfShape',[constant(np.array(dims,np.int64))],value=N.from_array(np.array([0],np.float32)))
 def gather(value,index,axis):return node('Gather',[value,constant(np.array(index,np.int64))],axis=axis)
 def slice_axis(value,begin,end,axis):return node('Slice',[value,constant(np.array([begin],np.int64)),constant(np.array([end],np.int64)),constant(np.array([axis],np.int64))])
 flat=shape(input_name,[1,c,plane]);value=shape(slice_axis(flat,0,groups*16,2),[1,c,groups,4,4]);count=groups;partials=[]
 for level in range(4):
  chunks=count//16;tail=count%16;partial=zero([1,c,4,4])
  for i in range(tail):partial=node('Add',[partial,gather(value,chunks*16+i,2)])
  partials.append(partial)
  if chunks:
   block=shape(slice_axis(value,0,chunks*16,2),[1,c,chunks,16,4,4]);value=zero([1,c,chunks,4,4])
   for i in range(16):value=node('Add',[value,gather(block,i,3)])
  count=chunks
 assert count==0
 total=partials[0]
 for p in partials[1:]:total=node('Add',[total,p])
 row0=gather(total,0,2)
 for v in range(groups*4,vectors):row0=node('Add',[row0,slice_axis(flat,v*4,v*4+4,2)])
 for r in range(1,4):row0=node('Add',[row0,gather(total,r,2)])
 scalar=zero([1,c])
 for p in range(vectors*4,plane):scalar=node('Add',[scalar,gather(flat,p,2)])
 for lane in range(4):scalar=node('Add',[scalar,gather(row0,lane,2)])
 mean=node('Div',[scalar,constant(np.array(plane,np.float32))]);output=shape(mean,[1,c,1,1]);nodes.append(H.make_node('Identity',[output],[output_name],name=prefix+'output'));return nodes,initializers
ref=json.loads((fixtures/'reference.json').read_text())
if '--units' in sys.argv:
 models={}
 for row in ref['records']:
  c,h,w=[row[k] for k in ['channels','height','width']];name=f'onnx-{c}-{h}-{w}.onnx'
  if name not in models:
   nodes,initializers=rewrite('input','output',c,h,w,'native_');graph=H.make_graph(nodes,'native-mean',[H.make_tensor_value_info('input',T.FLOAT,[1,c,h,w])],[H.make_tensor_value_info('output',T.FLOAT,[1,c,1,1])],initializers);model=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(model);onnx.save(model,fixtures/name);models[name]=hashlib.sha256((fixtures/name).read_bytes()).hexdigest()
  row['modelFile']=name;row['modelSha256']=models[name]
 (fixtures/'onnx-reference.json').write_text(json.dumps(ref,indent=2)+'\n');print('Created',len(models),'mean unit models');sys.exit(0)
source=base/'heads-exact-dlf-unfolded-resize-batchnorm.onnx';model=onnx.load(source);nodes=[];count=0
for item in model.graph.node:
 if item.op_type!='GlobalAveragePool':nodes.append(item);continue
 row=ref['records'][count];assert not row['name'].startswith('generated-')
 # Verify module identity as well as chronological order from the native hooks.
 assert item.name.endswith('/avg_pool/GlobalAveragePool')
 replacement,initializers=rewrite(item.input[0],item.output[0],row['channels'],row['height'],row['width'],'native_mean_'+str(count)+'_');nodes+=replacement;model.graph.initializer.extend(initializers);count+=1
assert count==54
model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);target=base/'heads-exact-dlf-unfolded-resize-batchnorm-mean.onnx';onnx.save(model,target);meta=json.loads((base/'heads-exact-dlf-unfolded-resize-batchnorm-model.json').read_text());meta.update(modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),meanNodes=count,meanCandidate='Native four-lane four-level cascade sum then float32 division; fixed448 shapes',rewriterSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest());(base/'heads-exact-dlf-unfolded-resize-batchnorm-mean-model.json').write_text(json.dumps(meta,indent=2)+'\n');print('Rewrote',count,'GlobalAveragePool nodes')
