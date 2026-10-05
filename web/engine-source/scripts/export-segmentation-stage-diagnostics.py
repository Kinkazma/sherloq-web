"""TNT stage localization. Native intermediate inputs remain diagnostic only."""
from pathlib import Path
import copy,hashlib,json,sys
import numpy as np
import torch
import onnx
from onnx import helper as H,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/segmentation-models/mgcfdn-tnt';out=base/'stages';out.mkdir(exist_ok=True)
ref=json.loads((base/'reference.json').read_text());row=ref['records'][0];assert row['name']=='structured-copy'
torch.set_num_threads(ref['referenceThreads']);network=load_segmentation(ref['variant'],'cpu')['model'];stages={}
def capture(name):
    def hook(module,args,output):stages[name]=output.detach().contiguous().clone()
    return hook
handles=[network.visual_feature_extractor.register_forward_hook(capture('features')),network.multi_granularity_consistency_module.register_forward_hook(capture('consistency')),network.decode_head.register_forward_hook(capture('lowLogits'))]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(base/row['input']['file'])==row['input']['sha256']
x=torch.from_numpy(np.fromfile(base/row['input']['file'],np.float32).reshape(row['input']['shape']))
try:
    with torch.inference_mode():logits=network(x)
    assert hashlib.sha256(logits.numpy().tobytes()).hexdigest()==row['logits']['sha256']
finally:
    for h in handles:h.remove()
model=onnx.load(base/'unfolded.onnx')
pool=next(n for n in model.graph.node if n.op_type=='ReduceL2' and n.name.startswith('/network/multi_granularity_consistency_module/'))
convs=[n for n in model.graph.node if n.op_type=='Conv' and n.name.startswith('/network/decode_head/')]
names=dict(features=pool.input[0],consistency=convs[0].input[0],lowLogits=convs[-1].output[0]);records={}
for label,value in stages.items():
    p=out/(label+'.bin');p.write_bytes(value.numpy().tobytes())
    records[label]=dict(file=p.name,bytes=p.stat().st_size,sha256=sha(p),shape=list(value.shape),name=names[label])
    model.graph.output.append(H.make_tensor_value_info(names[label],T.FLOAT,list(value.shape)))
onnx.checker.check_model(model);p=out/'diagnostic.onnx';onnx.save(model,p)
graphs=dict(full=dict(file=p.name,bytes=p.stat().st_size,sha256=sha(p)))
for label in stages:
    wanted={'logits','probability'};selected=[];boundary=names[label]
    for node in reversed(model.graph.node):
        if any(name in wanted and name!=boundary for name in node.output):
            selected.append(copy.deepcopy(node));wanted.update(node.input)
    selected.reverse();constants=[copy.deepcopy(v) for v in model.graph.initializer if v.name in wanted]
    graph=H.make_graph(selected,'diagnostic-native-'+label,[H.make_tensor_value_info(boundary,T.FLOAT,records[label]['shape'])],[copy.deepcopy(model.graph.output[i]) for i in [0,1]],constants)
    part=H.make_model(graph,opset_imports=model.opset_import,ir_version=model.ir_version);onnx.checker.check_model(part)
    p=out/(label+'.onnx');onnx.save(part,p);graphs[label]=dict(file=p.name,bytes=p.stat().st_size,sha256=sha(p))
report=dict(schema=1,status='diagnostic-only',case=row['name'],input=row['input'],logits=row['logits'],probability=row['probability'],stages=records,graphs=graphs,sourceModelSha256=sha(base/'unfolded.onnx'),scriptSha256=sha(Path(__file__)))
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Exported TNT stage localization',flush=True)
