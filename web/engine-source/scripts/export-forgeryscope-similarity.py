from pathlib import Path
import json,hashlib
import numpy as np
import torch
import onnx
from onnx import helper,TensorProto
out=Path(__file__).resolve().parents[1]/'.build/forgeryscope'
graph=helper.make_graph([helper.make_node('Transpose',['b'],['bt'],perm=[1,0]),helper.make_node('MatMul',['a','bt'],['scores'])],'Forgeryscope actual dot product',
    [helper.make_tensor_value_info('a',TensorProto.FLOAT,['n',1024]),helper.make_tensor_value_info('b',TensorProto.FLOAT,['m',1024])],
    [helper.make_tensor_value_info('scores',TensorProto.FLOAT,['n','m'])])
model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',18)]);model.ir_version=10
path=out/'similarity.onnx';onnx.checker.check_model(model);onnx.save(model,path)
cases=[]
for index,m in enumerate(json.loads((out/'embeddings-reference.json').read_text())['models']):
    vectors=np.array([c['embedding'] for c in m['cases']],np.float32)
    norm=np.linalg.norm(vectors,axis=1,keepdims=True)
    normalized=vectors/(norm+1e-8)
    for lane,values in [(False,vectors),(True,normalized)]:
        scores=values@values.T if lane else (torch.from_numpy(values)@torch.from_numpy(values).T).numpy()
        prefix=f'similarity-{index}-{int(lane)}'
        values.tofile(out/(prefix+'.f32'));scores.tofile(out/(prefix+'-scores.f32'))
        cases.append(dict(id=prefix,lane=lane,raw=vectors.tolist(),vectors=dict(file=prefix+'.f32',shape=list(values.shape)),scores=dict(file=prefix+'-scores.f32',shape=list(scores.shape))))
report=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=cases)
(out/'similarity-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print({k:v for k,v in report.items() if k!='cases'})
