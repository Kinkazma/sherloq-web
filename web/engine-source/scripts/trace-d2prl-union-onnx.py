"""Expose two diagnostic outputs from the already rejected head candidate."""
from pathlib import Path
import json,hashlib
import onnx
from onnx import helper as H,TensorProto as T
root=Path(__file__).resolve().parents[1];base=root/'.build/d2prl-model';source=base/'heads-exact-dlf-unfolded-resize.onnx';model=onnx.load(source);meta=json.loads((base/'heads-exact-dlf-unfolded-resize-model.json').read_text());ref=json.loads((base/'reference.json').read_text());union=root/'.build/d2prl-union';native=json.loads((union/'reference.json').read_text());meta['expected']=ref['raw'].copy()
for internal,name,key in [('/last_mask/last_mask.13/Sigmoid_output_0','trace_union_head','sigmoid'),('/unet/final/final.1/Sigmoid_output_0','trace_unet','unet')]:
 assert any(internal in n.output for n in model.graph.node)
 model.graph.node.append(H.make_node('Identity',[internal],[name],name=name));model.graph.output.append(H.make_tensor_value_info(name,T.FLOAT,[1,1,448,448]));e=native[key];data=(union/e['file']).read_bytes();assert hashlib.sha256(data).hexdigest()==e['sha256'];filename='native-'+name+'.bin';(base/filename).write_bytes(data);meta['expected'].append({**e,'file':filename});meta['outputs'].append(name)
onnx.checker.check_model(model);target=base/'heads-exact-dlf-unfolded-resize-union-trace.onnx';onnx.save(model,target);meta.update(modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=hashlib.sha256(target.read_bytes()).hexdigest(),scope='Two intermediate sigmoid outputs exposed for localization; not complete browser inference');(base/'heads-exact-dlf-unfolded-resize-union-trace-model.json').write_text(json.dumps(meta,indent=2)+'\n');print('Union diagnostic graph saved')
