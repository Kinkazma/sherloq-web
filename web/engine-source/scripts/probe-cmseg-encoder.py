"""Isolate actual native encoder operators on the failing public JPEG ROI.
Diagnostic fixtures, not a model replacement or a source of inference tensors.
"""
from pathlib import Path
import sys,hashlib,json
import numpy as np
import torch,torch.utils.model_zoo
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
base=root/'.build/cmseg-jpeg-diagnostic';reference=json.loads((base/'reference.json').read_text());spec=reference['records'][0]['input'];b=(base/spec['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==spec['sha256'];x=torch.from_numpy(np.frombuffer(b,np.float32).copy().reshape(spec['shape']))
out=root/'.build/cmseg-encoder-diagnostic';out.mkdir(exist_ok=True)
def deny(*a,**k):raise RuntimeError('No diagnostic network downloads')
torch.hub.download_url_to_file=deny;torch.utils.model_zoo.load_url=deny;torch.set_num_threads(8)
m=load_segmentation('CMSeg-Net generalization','cpu')['model'].eval();records=[];hooks=[]
def save(name,value):
    if isinstance(value,torch.Tensor):value=value.detach().cpu().numpy()
    value=np.ascontiguousarray(value);b=value.tobytes();file=name+'.bin';(out/file).write_bytes(b);return dict(file=file,bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),shape=list(value.shape),dtype=str(value.dtype))
for name,module in m.encoder.features.named_modules():
    if not name or int(name.split('.')[0])>=4 or not isinstance(module,(torch.nn.Conv2d,torch.nn.BatchNorm2d)):continue
    def capture(module,inputs,output,name=name):
        n=len(records);prefix=str(n);record=dict(name=name,index=n,kind=type(module).__name__,input=save(prefix+'-input',inputs[0]),output=save(prefix+'-output',output))
        if isinstance(module,torch.nn.Conv2d):
            record.update(weights=save(prefix+'-weights',module.weight),bias=save(prefix+'-bias',module.bias if module.bias is not None else np.zeros(module.out_channels,np.float32)),hasBias=module.bias is not None,groups=module.groups,stride=module.stride[0],padding=module.padding[0],kernel=module.kernel_size[0],dilation=module.dilation[0])
            initializers=[N.from_array(module.weight.detach().numpy(),'weight')];args=['input','weight']
            if module.bias is not None:initializers.append(N.from_array(module.bias.detach().numpy(),'bias'));args.append('bias')
            nodes=[H.make_node('Conv',args,['output'],kernel_shape=list(module.kernel_size),strides=list(module.stride),pads=[*module.padding,*module.padding],dilations=list(module.dilation),group=module.groups)]
        else:
            initializers=[]
            for key,value in [('weight',module.weight),('bias',module.bias),('mean',module.running_mean),('variance',module.running_var)]:initializers.append(N.from_array(value.detach().numpy(),key));record[key]=save(prefix+'-'+key,value)
            record['epsilon']=module.eps
            nodes=[H.make_node('BatchNormalization',['input','weight','bias','mean','variance'],['output'],epsilon=module.eps,training_mode=0)]
        graph=H.make_graph(nodes,'isolated-native-encoder-operator',[H.make_tensor_value_info('input',T.FLOAT,list(inputs[0].shape))],[H.make_tensor_value_info('output',T.FLOAT,list(output.shape))],initializer=initializers);model=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=8);onnx.checker.check_model(model);path=out/(prefix+'.onnx');onnx.save(model,path);b=path.read_bytes();record['graph']=dict(file=path.name,bytes=len(b),sha256=hashlib.sha256(b).hexdigest());records.append(record)
    hooks.append(module.register_forward_hook(capture))
with torch.inference_mode():
    for i in range(4):x=m.encoder.features[i](x)
for h in hooks:h.remove()
expected=np.fromfile(base/reference['records'][0]['features'][1]['file'],np.float32).reshape(reference['records'][0]['features'][1]['shape']);assert np.array_equal(x.numpy(),expected)
(out/'reference.json').write_text(json.dumps(dict(schema=1,scope='Native encoder Conv/BN inputs for isolated arithmetic diagnosis only',torch=torch.__version__,records=records),indent=2)+'\n');print('Captured',len(records),'operators; feature x2 exact')
