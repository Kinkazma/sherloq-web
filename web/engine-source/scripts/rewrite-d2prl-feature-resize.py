"""Offline ONNX experiment: explicitly emulate native float32 resize arithmetic.
Double temporaries evaluate float32 fused products; casts restore every native
rounding point. This candidate requires numerical qualification, including ties.
"""
from pathlib import Path
import json,hashlib,sys
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-model'
def rewrite(input_name,output_name,ih,iw,oh,ow,prefix):
 nodes=[];initializers=[]
 def constant(name,value):
  name=prefix+name;initializers.append(N.from_array(value,name));return name
 def node(op,args,name,**attrs):
  name=prefix+name;nodes.append(H.make_node(op,args,[name],name=name,**attrs));return name
 value=input_name
 for axis,ins,outs in [(3,iw,ow),(2,ih,oh)]:
  ratio=np.float32(ins-1)/np.float32(outs-1);real=np.arange(outs,dtype=np.float32)*ratio;lower=np.minimum(np.floor(real).astype(np.int64),ins-1);upper=np.minimum(lower+1,ins-1);weight=np.clip(real-lower.astype(np.float32),0,1).astype(np.float32);shape=[1,1,1,1];shape[axis]=outs
  lo=constant(f'lo{axis}',lower);hi=constant(f'hi{axis}',upper);wl=constant(f'wl{axis}',(np.float32(1)-weight).reshape(shape));wh=constant(f'wh{axis}',weight.reshape(shape));a=node('Gather',[value,lo],f'a{axis}',axis=axis);b=node('Gather',[value,hi],f'b{axis}',axis=axis)
  # fma(a, wl, round32(b*wh)), then round32; independent of ORT fusion.
  q=node('Mul',[b,wh],f'q{axis}');ad=node('Cast',[a],f'ad{axis}',to=T.DOUBLE);wd=node('Cast',[wl],f'wd{axis}',to=T.DOUBLE);qd=node('Cast',[q],f'qd{axis}',to=T.DOUBLE);product=node('Mul',[ad,wd],f'p{axis}');total=node('Add',[product,qd],f't{axis}');value=node('Cast',[total],f'r{axis}',to=T.FLOAT)
 nodes.append(H.make_node('Identity',[value],[output_name],name=prefix+'output'));return nodes,initializers
if __name__=='__main__':
 if '--units' in sys.argv:
  dest=root/'.build/d2prl-resize';reference=json.loads((dest/'reference.json').read_text());models={}
  for row in reference['records']:
   geometry=(row['channels'],row['height'],row['width'],row['outHeight'],row['outWidth']);name='onnx-'+'-'.join(map(str,geometry))+'.onnx'
   if name not in models:
    c,ih,iw,oh,ow=geometry;nodes,initializers=rewrite('input','output',ih,iw,oh,ow,'native_');graph=H.make_graph(nodes,'native-resize-candidate',[H.make_tensor_value_info('input',T.FLOAT,[1,c,ih,iw])],[H.make_tensor_value_info('output',T.FLOAT,[1,c,oh,ow])],initializers);model=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(model);onnx.save(model,dest/name);models[name]=hashlib.sha256((dest/name).read_bytes()).hexdigest()
   row['modelFile']=name;row['modelSha256']=models[name]
  (dest/'onnx-reference.json').write_text(json.dumps(reference,indent=2)+'\n');print('Generated',len(models),'resize models');sys.exit(0)
 source=out/'features-unfolded.onnx';model=onnx.load(source);geometries=[(448,448,298,298),(448,448,597,597),(597,597,448,448),(597,597,448,448),(298,298,448,448),(298,298,448,448)];nodes=[];count=0
 for node in model.graph.node:
  if node.op_type!='Resize':nodes.append(node);continue
  attrs={a.name:H.get_attribute_value(a) for a in node.attribute};assert attrs.get('coordinate_transformation_mode')==b'align_corners' and attrs.get('mode')==b'linear'
  replacements,initializers=rewrite(node.input[0],node.output[0],*geometries[count],prefix='reference_resize_'+str(count)+'_');nodes+=replacements;model.graph.initializer.extend(initializers);count+=1
 assert count==6;model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);target=out/'features-unfolded-resize.onnx';onnx.save(model,target);metadata=json.loads((out/'features-unfolded-model.json').read_text());metadata.update(modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),originalModelSha256=hashlib.sha256(source.read_bytes()).hexdigest(),resizeCandidate='Fixed448 multiscale generic NCHW, float64 emulation of native float32 FMA; requires qualification',rewriterSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest());(out/'features-unfolded-resize-model.json').write_text(json.dumps(metadata,indent=2)+'\n');print('Rewrote',count,'resize nodes')
