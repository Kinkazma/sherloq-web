"""Export only actual checkpoint parameters and native architecture; diagnostic outputs stay separate."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import torch,torch.utils.model_zoo
import onnx
from onnx import helper as H,TensorProto as T
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
out=root/'.build/cmseg-backbone-candidate';out.mkdir(exist_ok=True);(out/'parameters').mkdir(exist_ok=True)
def deny(*a,**k):raise RuntimeError('Offline export')
torch.hub.download_url_to_file=deny;torch.utils.model_zoo.load_url=deny;torch.set_num_threads(8)
loaded=load_segmentation('CMSeg-Net generalization','cpu');model=loaded['model'].eval();params={};nodes=[]
def parameter(name,tensor):
    a=np.ascontiguousarray(tensor.detach().cpu().numpy());b=a.tobytes();sha=hashlib.sha256(b).hexdigest();file='parameters/'+sha+'.bin';(out/file).write_bytes(b);params[name]=dict(file=file,bytes=len(b),sha256=sha,shape=list(a.shape),dtype=str(a.dtype));return name
def emit(module,name,source):
    dest='value-'+str(len(nodes))
    if isinstance(module,torch.nn.Conv2d):
        assert module.kernel_size[0]==module.kernel_size[1] and module.dilation==(1,1) and module.bias is None
        nodes.append(dict(op='Conv',name=name,input=[source,parameter(name+'.weight',module.weight)],output=dest,attrs=dict(kernel=module.kernel_size[0],padding=module.padding[0],stride=module.stride[0],groups=module.groups)))
    elif isinstance(module,torch.nn.BatchNorm2d):
        nodes.append(dict(op='BatchNormalization',name=name,input=[source,*[parameter(name+'.'+key,t) for key,t in [('weight',module.weight),('bias',module.bias),('mean',module.running_mean),('variance',module.running_var)]]] ,output=dest,attrs=dict(training_mode=0,epsilon=module.eps)))
    elif isinstance(module,torch.nn.ReLU6):nodes.append(dict(op='Clip6',name=name,input=[source],output=dest,attrs={}))
    elif isinstance(module,torch.nn.Sequential):
        for key,child in module.named_children():source=emit(child,name+'.'+key,source)
        return source
    elif hasattr(module,'conv') and hasattr(module,'use_res_connect'):
        value=emit(module.conv,name+'.conv',source)
        if not module.use_res_connect:return value
        dest='value-'+str(len(nodes));nodes.append(dict(op='Add',name=name+'.residual',input=[source,value],output=dest,attrs={}))
    else:raise ValueError(type(module))
    return dest
outputs={};source='rgb'
for i,m in enumerate(model.encoder.features):
    source=emit(m,'features.'+str(i),source)
    if i in [1,3,6,13,18]:outputs[{1:'bypass',3:'x2',6:'x3',13:'x4',18:'x5'}[i]]=source
manifest=dict(schema=1,status='experimental-not-public',variant='cmseg-generalization',input='rgb',inputShape=[1,3,512,512],nodes=nodes,parameters=params,outputs=outputs,weights=loaded['weights'])
(out/'backbone.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Keep the qualified ASPP/SAM arithmetic, with the real backbone boundary as input.
pinned=root/'.build/segmentation-models/cmseg-generalization/encoder-native-mean-bn.onnx';m=onnx.load(pinned);cut='/features.1/conv/conv.4/BatchNormalization_output_0';m.graph.value_info.append(H.make_tensor_value_info(cut,T.FLOAT,[1,16,256,256]));head=onnx.utils.Extractor(m).extract_model([cut],['x1']);onnx.checker.check_model(head);onnx.save(head,out/'bypass.onnx');print('Backbone',len(nodes),'nodes,',sum(v['bytes'] for v in params.values()),'parameter bytes; verify boundaries with the separate browser recipe')

# Independent package identity; do not overwrite the rejected v1 bundle.
def identity(file):
    data=(out/file).read_bytes();return dict(file=file,bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
decoder=root/'.build/segmentation-models/cmseg-generalization/decoder-native-mean-bn.onnx'
link=out/decoder.name
if not link.exists():link.symlink_to(Path('../segmentation-models/cmseg-generalization')/decoder.name)
correlation=json.loads((root/'.build/segmentation-models/cmseg-generalization/split-reference.json').read_text())['correlation']
package=dict(id='cmseg-generalization-native512-backbone-v2',side=512,backbone=identity('backbone.json'),graphs=[dict(id='bypass',**identity('bypass.onnx')),dict(id='decoder',**identity(decoder.name))],correlation=correlation)
(out/'bundle.json').write_text(json.dumps(package,indent=2)+'\n')
model=dict(id=package['id'],**{k:v for k,v in identity('bundle.json').items() if k!='file'},assetBytes=sum(v['bytes'] for v in package['graphs']),backbone=package['backbone'],checkpointSha256='a3351ae664fca9780c3ca56db708fe3fdc74878c07327dfdd6ed75f14537454b',correlation=correlation,variant='CMSeg-Net generalization',family='cmseg',side=512,kind='sigmoid',status='experimental-cpu-corpus',cpuContinuousBitExact=False)
(out/'model-identity.json').write_text(json.dumps(model,indent=2)+'\n');print(json.dumps(model))

# Explicit weight-delivery allowlist; never include diagnostic activations.
files=['bundle.json','backbone.json','bypass.onnx',decoder.name,*sorted({p['file'] for p in params.values()})]
(out/'delivery-manifest.json').write_text(json.dumps(dict(schema=1,modelId=package['id'],files=[identity(f) for f in files]),indent=2)+'\n')
