"""Explicit native small-map arithmetic for an offline ONNX heads candidate.
Float64 FMA emulation is a qualified candidate, not a universal FMA identity.
"""
from pathlib import Path
import sys,json,hashlib,importlib.util
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('large',root/'scripts/rewrite-d2prl-feature-resize.py');large=importlib.util.module_from_spec(spec);spec.loader.exec_module(large)
def rewrite(input_name,output_name,c,ih,iw,oh,ow,prefix):
 if oh+ow>128:return large.rewrite(input_name,output_name,ih,iw,oh,ow,prefix)
 nodes=[];initializers=[]
 def constant(name,value):
  name=prefix+name;initializers.append(N.from_array(np.asarray(value),name));return name
 def node(op,args,name,**attrs):
  name=prefix+name;nodes.append(H.make_node(op,args,[name],name=name,**attrs));return name
 def fma(a,b,acc,name):
  ad=node('Cast',[a],name+'a',to=T.DOUBLE);bd=node('Cast',[b],name+'b',to=T.DOUBLE);cd=node('Cast',[acc],name+'c',to=T.DOUBLE)
  return node('Cast',[node('Add',[node('Mul',[ad,bd],name+'m'),cd],name+'s')],name+'f',to=T.FLOAT)
 rx=np.arange(ow,dtype=np.float32)*(np.float32(iw-1)/np.float32(ow-1));ry=np.arange(oh,dtype=np.float32)*(np.float32(ih-1)/np.float32(oh-1))
 x0=np.minimum(np.floor(rx).astype(np.int64),iw-1);x1=np.minimum(x0+1,iw-1);y0=np.minimum(np.floor(ry).astype(np.int64),ih-1);y1=np.minimum(y0+1,ih-1)
 lx=np.clip(rx-x0.astype(np.float32),0,1);ly=np.clip(ry-y0.astype(np.float32),0,1);hx=np.float32(1)-lx;hy=np.float32(1)-ly
 flat=node('Reshape',[input_name,constant('flatshape',np.array([1,c,ih*iw],np.int64))],'flat');outshape=constant('outshape',np.array([1,c,oh,ow],np.int64));values=[];weights=[];products=[]
 for i,(y,x,wy,wx) in enumerate([(y0,x0,hy,hx),(y0,x1,hy,lx),(y1,x0,ly,hx),(y1,x1,ly,lx)]):
  indices=constant('i'+str(i),(y[:,None]*iw+x[None,:]).reshape(-1));v=node('Reshape',[node('Gather',[flat,indices],'g'+str(i),axis=2),outshape],'v'+str(i));w=constant('w'+str(i),(wy[:,None]*wx[None,:]).reshape(1,1,oh,ow).astype(np.float32));values.append(v);weights.append(w);products.append(node('Mul',[v,w],'p'+str(i)))
 vector=node('Add',[products[0],node('Add',[products[1],node('Add',[products[2],products[3]],'v23')],'v123')],'vector') if c>=4 else None
 scalar=None
 if c%4:
  scalar=fma(values[0],weights[0],products[1],'s01');scalar=fma(values[2],weights[2],scalar,'s012');scalar=fma(values[3],weights[3],scalar,'s0123')
 value=vector if not c%4 else scalar if c<4 else node('Where',[constant('vectorChannels',(np.arange(c)<c-c%4).reshape(1,c,1,1)),vector,scalar],'mixed')
 nodes.append(H.make_node('Identity',[value],[output_name],name=prefix+'output'));return nodes,initializers
if '--units' in sys.argv:
 for kind in ['resize-small','head-resize']:
  dest=root/('.build/d2prl-'+kind);reference=json.loads((dest/'reference.json').read_text());models={}
  for row in reference['records']:
   geometry=tuple(row[k] for k in ['channels','height','width','outHeight','outWidth']);name='onnx-'+'-'.join(map(str,geometry))+'.onnx'
   if name not in models:
    c,ih,iw,oh,ow=geometry;nodes,initializers=rewrite('input','output',*geometry,'native_');graph=H.make_graph(nodes,'native-head-resize',[H.make_tensor_value_info('input',T.FLOAT,[1,c,ih,iw])],[H.make_tensor_value_info('output',T.FLOAT,[1,c,oh,ow])],initializers);model=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(model);onnx.save(model,dest/name);models[name]=hashlib.sha256((dest/name).read_bytes()).hexdigest()
   row['modelFile']=name;row['modelSha256']=models[name]
  (dest/'onnx-reference.json').write_text(json.dumps(reference,indent=2)+'\n');print(kind,len(models),'unit models',flush=True)
 sys.exit(0)
out=root/'.build/d2prl-model';source=out/'heads-exact-dlf-unfolded.onnx';model=onnx.load(source);ref=json.loads((root/'.build/d2prl-head-resize/reference.json').read_text());nodes=[];count=0
for item in model.graph.node:
 attrs={a.name:H.get_attribute_value(a) for a in item.attribute}
 if item.op_type!='Resize' or attrs.get('mode')!=b'linear':nodes.append(item);continue
 assert attrs.get('coordinate_transformation_mode')==b'align_corners'
 row=ref['records'][count];geometry=tuple(row[k] for k in ['channels','height','width','outHeight','outWidth']);replacement,initializers=rewrite(item.input[0],item.output[0],*geometry,'native_head_resize_'+str(count)+'_');nodes+=replacement;model.graph.initializer.extend(initializers);count+=1
assert count==len(ref['records'])==11
model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);target=out/'heads-exact-dlf-unfolded-resize.onnx';onnx.save(model,target)
metadata=json.loads((out/'heads-exact-dlf-unfolded-model.json').read_text());metadata.update(modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),originalModelSha256=hashlib.sha256(source.read_bytes()).hexdigest(),resizeCandidate='Fixed native 448 head geometry; vector right-associated Float32 products/sums, scalar-tail ordered FMA emulation and generic large path',rewriterSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest());(out/'heads-exact-dlf-unfolded-resize-model.json').write_text(json.dumps(metadata,indent=2)+'\n');print('Rewrote',count,'head resize nodes',flush=True)
