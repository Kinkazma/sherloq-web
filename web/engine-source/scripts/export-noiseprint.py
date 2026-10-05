"""Lossless checkpoint conversion for all 51 native Noiseprint quality models."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import onnx
from onnx import helper as h,numpy_helper as nh,TensorProto as T
import tensorflow as tf
tf.config.set_visible_devices([], 'GPU')
tf.compat.v1.disable_v2_behavior()
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.noiseprint_mps import load_weights
out=root/'.build/noiseprint';out.mkdir(parents=True,exist_ok=True);assets={}
for quality in range(51,102):
 weights=load_weights(quality,cache_root=out/'weights');nodes=[];constants=[];x='gray'
 def constant(name,value):constants.append(nh.from_array(np.asarray(value,dtype=np.float32),name));return name
 for i in range(17):
  name=f'level_{i}';w=constant(name+'/weight',weights[f'{i}_weight'].transpose(3,2,0,1).copy());conv=name+'/conv'
  nodes.append(h.make_node('Conv',[x,w],[conv],pads=[1,1,1,1]));x=conv
  if 0<i<16:
   variance=constant(name+'/variance',weights[f'{i}_moving_variance'].reshape(1,-1,1,1));mean=constant(name+'/mean',weights[f'{i}_moving_mean'].reshape(1,-1,1,1));gamma=constant(name+'/gamma',weights[f'{i}_gamma'].reshape(1,-1,1,1));epsilon=constant(name+'/epsilon',np.float32(1e-5))
   for op,inputs,output in [('Add',[variance,epsilon],'var_eps'),('Sqrt',[name+'/var_eps'],'sqrt'),('Reciprocal',[name+'/sqrt'],'rsqrt'),('Mul',[name+'/rsqrt',gamma],'inv'),('Mul',[x,name+'/inv'],'scaled'),('Mul',[mean,name+'/inv'],'offset'),('Sub',[name+'/scaled',name+'/offset'],'normalized')]:nodes.append(h.make_node(op,inputs,[name+'/'+output]))
   x=name+'/normalized'
  bias=constant(name+'/bias',weights[f'{i}_bias'].reshape(1,-1,1,1));nodes.append(h.make_node('Add',[x,bias],[name+'/biased']));x=name+'/biased'
  if i<16:nodes.append(h.make_node('Relu',[x],[name+'/relu']));x=name+'/relu'
 nodes.append(h.make_node('Identity',[x],['noise']))
 graph=h.make_graph(nodes,f'noiseprint_quality_{quality}',[h.make_tensor_value_info('gray',T.FLOAT,[1,1,'h','w'])],[h.make_tensor_value_info('noise',T.FLOAT,[1,1,'h','w'])],constants)
 model=h.make_model(graph,opset_imports=[h.make_opsetid('',19)],ir_version=10);onnx.checker.check_model(model)
 path=out/f'noiseprint-{quality}.onnx';onnx.save(model,path)
 with np.load(out/'weights'/f'model-{quality}.npz',allow_pickle=False) as cache:checkpoint=str(cache['checkpoint_sha256'])
 assets[str(quality)]=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),checkpointSha256=checkpoint,graphOptimizationLevel='disabled')
 print('Exported',quality,flush=True)
(out/'manifest.json').write_text(json.dumps(dict(schema=1,assets=assets,cases=[]),separators=(',',':'))+'\n')
print('Run generate-noiseprint-reference.py in a fresh CPU-only process for native references.',flush=True)
