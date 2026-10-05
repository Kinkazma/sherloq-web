"""Localize an observed JPEG probability failure using native intermediate tensors.

Oracles are only for diagnosis. They are never inputs to the public detector.
No conversion, checkpoint or native application file is modified.
"""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import cv2 as cv
import torch,torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
from gui.sherloq_app.core.model_inputs import pil_resize
variant='generalization';base=root/'.build/neural-segmented/cmseg-generalization';ref=json.loads((base/'reference.json').read_text());zone=ref['zones'][1]
out=root/'.build/cmseg-jpeg-diagnostic';out.mkdir(exist_ok=True)
def denied(*a,**k):raise RuntimeError('Offline diagnosis')
torch.hub.download_url_to_file=denied;torch.utils.model_zoo.load_url=denied;torch.set_num_threads(8)
loaded=load_segmentation('CMSeg-Net generalization','cpu');m=loaded['model']
image=cv.imread(str(base/ref['original']['file']));x0,y0,x1,y1=zone['bounds'];crop=image[y0:y1,x0:x1];tensor=pil_resize(crop,512)[None]
sha=lambda a:hashlib.sha256(a).hexdigest()
def save(name,value):
    if isinstance(value,torch.Tensor):value=value.detach().cpu().numpy()
    value=np.ascontiguousarray(value);data=value.tobytes();filename=name+'.bin';(out/filename).write_bytes(data);return dict(file=filename,shape=list(value.shape),dtype=str(value.dtype),bytes=len(data),sha256=sha(data))
captured={};hooks=[]
for name in ['corr24','corr32','corr96']:
    def capture(module,inputs,output,name=name):captured[name]=(inputs[0].clone(),output.clone())
    hooks.append(getattr(m,name).register_forward_hook(capture))
with torch.inference_mode():
    logits=m(tensor);probability=logits.sigmoid();expected=np.fromfile(base/ref['raw'][1]['file'],np.float32).reshape(ref['raw'][1]['shape']);assert np.array_equal(probability[0].numpy(),expected)
    features=[];x=tensor
    for start,end in [(0,2),(2,4),(4,7),(7,14),(14,19)]:
        for index in range(start,end):x=m.encoder.features[index](x)
        features.append(m.sam1(m.aspp4(x)) if start==0 else x)
    probes=[]
    for level,name in enumerate(['corr24','corr32','corr96']):
        feature=features[level+1];assert torch.equal(feature,captured[name][0]);_,c,h,w=feature.shape;n=h*w
        xn=torch.nn.functional.normalize(feature,p=2,dim=-3);rows=[0,1,w-1,w,n//2,n-1]
        matrix=torch.matmul(xn.permute(0,2,3,1).view(1,-1,c),xn.view(1,c,-1));samples=matrix[0,rows,:].clone();del matrix
        gy=torch.exp(-torch.arange(h).float().square()/(2*(h*.05)**2));gx=torch.exp(-torch.arange(w).float().square()/(2*(w*.05)**2))
        probes.append(dict(name=name,normalized=save(name+'-normalized',xn),rows=rows,dot=save(name+'-dots',samples),gaussianY=save(name+'-gaussian-y',gy),gaussianX=save(name+'-gaussian-x',gx)))
    record=dict(name='jpeg-roi-b',rgb=save('rgb',cv.cvtColor(crop,cv.COLOR_BGR2RGB)),input=save('input',tensor),logits=save('logits',logits),probability=save('probability',probability),features=[save('feature-'+str(i),v) for i,v in enumerate(features)],correlations=[save(name,captured[name][1]) for name in ['corr24','corr32','corr96']],mask=save('mask',(probability>.5).to(torch.uint8)),nativeForeground=int((probability>.5).sum()),probes=probes)
for h in hooks:h.remove()
original=json.loads((root/'.build/segmentation-models/cmseg-generalization/split-reference.json').read_text());model_base=root/'.build/segmentation-models/cmseg-generalization';graphs={name:{**spec,'file':str(Path('../segmentation-models/cmseg-generalization')/spec['file'])} for name,spec in json.loads((model_base/'native-mean-bn.json').read_text())['graphs'].items()}
report=dict(schema=1,variant='cmseg-generalization',side=512,kind='sigmoid',graphs=graphs,weights=original['weights'],correlation=original['correlation'],records=[record],scope='Known failing JPEG ROI; native activations for numerical localization only.',torch=torch.__version__)
(out/'reference.json').write_text(json.dumps(report,indent=2)+'\n');print('CMSeg JPEG diagnostic captured',flush=True)
