#!/usr/bin/env python3
"""Private functional export of the exact fixed-parameter upstream ConvCRF.

No learned replacement, training, dtype change or source-input approximation.
Dynamic source coordinates replace only the baked512 mesh/padding dimensions.
"""
from pathlib import Path
import argparse,copy,hashlib,json,sys,time,traceback
import numpy as np
import torch
import torch.nn.functional as F
import cv2

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('native_source',type=Path,help='Pinned ConvCRF source with device-only CPU adaptation')
parser.add_argument('reference_image',type=Path,help='BGR8 reference image, used only for development parity')
parser.add_argument('reference_score',type=Path,help='Native Float32 proposal score NPY')
parser.add_argument('output_directory',type=Path)
parser.add_argument('--python-dependencies',type=Path)
args=parser.parse_args()
HERE=args.output_directory.resolve();HERE.mkdir(parents=True,exist_ok=True)
sys.path[:0]=[str(args.native_source.resolve())]+([str(args.python_dependencies.resolve())] if args.python_dependencies else [])
import convcrf
import onnx
import onnxruntime as ort

@torch.jit.script
def native_pool(value:torch.Tensor,p0:int,p1:int)->torch.Tensor:
    if p0==0:
        if p1==0:return F.avg_pool2d(value,4,padding=(0,0),count_include_pad=False)
        if p1==1:return F.avg_pool2d(value,4,padding=(0,1),count_include_pad=False)
        return F.avg_pool2d(value,4,padding=(0,2),count_include_pad=False)
    if p0==1:
        if p1==0:return F.avg_pool2d(value,4,padding=(1,0),count_include_pad=False)
        if p1==1:return F.avg_pool2d(value,4,padding=(1,1),count_include_pad=False)
        return F.avg_pool2d(value,4,padding=(1,2),count_include_pad=False)
    if p1==0:return F.avg_pool2d(value,4,padding=(2,0),count_include_pad=False)
    if p1==1:return F.avg_pool2d(value,4,padding=(2,1),count_include_pad=False)
    return F.avg_pool2d(value,4,padding=(2,2),count_include_pad=False)

class DynamicCRF(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('pos_sdims',torch.tensor(1/3,dtype=torch.float32))
        self.register_buffer('col_schan',torch.tensor(1/13,dtype=torch.float32))
        self.register_buffer('weight',torch.full((1,2,1,1),.2,dtype=torch.float32))
    def forward(self,unary:torch.Tensor,image:torch.Tensor,origin:torch.Tensor)->torch.Tensor:
        h,w=image.shape[2],image.shape[3]
        p0=((4-h%4)%4+1)//2
        p1=((4-w%4)%4+1)//2
        y=(torch.arange(h,dtype=torch.float32,device=image.device)+origin[0]).view(1,1,h,1).expand(1,1,h,w)
        x=(torch.arange(w,dtype=torch.float32,device=image.device)+origin[1]).view(1,1,1,w).expand(1,1,h,w)
        position=native_pool(torch.cat((y,x),dim=1)*self.pos_sdims,p0,p1)
        colour=native_pool(image*self.col_schan,p0,p1)
        ph,pw=colour.shape[2],colour.shape[3]
        # Same49 offsets, position/colour sums and FP32 order; vectorize the
        # neighbour planes rather than materialize49 copies of graph code.
        positions=F.unfold(position,(7,7),padding=(3,3)).reshape(1,2,49,ph,pw)
        colours=F.unfold(colour,(7,7),padding=(3,3)).reshape(1,3,49,ph,pw)
        valid=F.unfold(torch.ones((1,1,ph,pw),dtype=torch.float32,device=image.device),(7,7),padding=(3,3)).reshape(1,1,49,ph,pw)
        delta_pos=position.unsqueeze(2)-positions
        delta_col=colour.unsqueeze(2)-colours
        pos=torch.exp(torch.sum(-.5*(delta_pos*delta_pos),dim=1,keepdim=True))*3
        col=torch.exp(torch.sum(-.5*(delta_col*delta_col),dim=1,keepdim=True))*10
        gaussian=(pos+col)*valid
        logunary=F.log_softmax(unary,dim=1)
        coarse=native_pool(logunary,p0,p1)
        patches=F.unfold(coarse,(7,7),padding=(3,3)).reshape(1,2,49,ph,pw)
        message=(gaussian*patches).sum(dim=2)
        message=F.interpolate(message,scale_factor=4.,mode='bilinear',align_corners=False)
        message=message[:,:,p0:p0+h,p1:p1+w].contiguous()
        prediction=(1.-self.weight)*logunary+self.weight*message
        return 1.-F.softmax(prediction,dim=1)[:,0]

def stats(a,b):
    return {'maxAbs':float(np.max(np.abs(a-b))),'maskChanges':int(np.count_nonzero((a>.5)!=(b>.5))),'nonfinite':int(np.count_nonzero(~np.isfinite(b)))}

torch.set_num_threads(4)
torch.set_grad_enabled(False)
model=torch.jit.script(DynamicCRF().eval())
record={'schema':1,'scope':'Private same-formula dynamic ConvCRF export; comparison against unmodified native tensor operations with device-only adaptations','sourceCommit':'ef7b4a00d0c5742a63b187d898979259c2aead40','torch':torch.__version__,'nativeCases':[],'ortCases':[]}
started=time.monotonic()
source=cv2.imread(str(args.reference_image),cv2.IMREAD_COLOR)
if source is None:raise ValueError('Reference image cannot be read')
score=np.load(args.reference_score).astype(np.float32)
cases=[]
try:
    for width,height in [(512,512),(416,320),(32,32),(47,33),(640,832),(831,641)]:
        image=cv2.resize(source,(width,height)).transpose(2,0,1)[None].astype(np.float32)
        positive=cv2.resize(score,(width,height)).astype(np.float32)
        unary=np.stack((1-positive,positive))[None]
        config=copy.deepcopy(convcrf.default_conf);config['filter_size']=7
        original=convcrf.GaussCRF(config,[height,width],2).eval()
        native=(1-original(torch.from_numpy(unary),torch.from_numpy(image),num_iter=1).softmax(1)[:,0]).numpy()
        actual=model(torch.from_numpy(unary),torch.from_numpy(image),torch.zeros(2)).numpy()
        parity=stats(native,actual)
        record['nativeCases'].append({'width':width,'height':height,**parity,'bitExact':bool(np.array_equal(native,actual))})
        if parity['nonfinite'] or parity['maskChanges'] or parity['maxAbs']>1e-5:raise ValueError('Functional CRF changed native decisions: '+str(record['nativeCases'][-1]))
        cases.append((width,height,unary,image,native))
    out=HERE/'convcrf-vectorized-dynamic.onnx'
    torch.onnx.export(model,(torch.from_numpy(cases[0][2]),torch.from_numpy(cases[0][3]),torch.zeros(2)),out,input_names=['unary','image','origin'],output_names=['probability'],dynamic_axes={'unary':{2:'height',3:'width'},'image':{2:'height',3:'width'},'probability':{1:'height',2:'width'}},opset_version=18,dynamo=False,do_constant_folding=False,external_data=False)
    onnx.checker.check_model(onnx.load(out),full_check=True)
    session=ort.InferenceSession(str(out),providers=['CPUExecutionProvider'])
    for width,height,unary,image,native in cases:
        output=session.run(None,{'unary':unary,'image':image,'origin':np.zeros(2,np.float32)})[0]
        parity=stats(native,output)
        record['ortCases'].append({'width':width,'height':height,**parity})
        if parity['nonfinite'] or parity['maskChanges'] or parity['maxAbs']>1e-4:raise ValueError('ORT dynamic CRF differs from native: '+str(record['ortCases'][-1]))
        fixture=HERE/'dynamic-crf-fixtures';fixture.mkdir(exist_ok=True)
        for name,data in [('unary',unary),('image',image),('probability',native)]:data.tofile(fixture/f'{width}x{height}-{name}.bin')
    def window(size,a,b):
        import math
        phase=((4-size%4)%4+1)//2
        first=max(0,math.floor((a+phase+.5)/4-.5)-5)
        last=min(math.ceil(size/4),math.ceil((b-1+phase+.5)/4-.5)+6)
        start=max(0,first*4-phase);end=min(size,last*4-phase)
        if start==0 and end<size:end=min(size,end+(size-end)%4)
        elif end==size and start>0:start=first*4
        return start,end
    record['windowCases']=[]
    for width,height,unary,image,native in cases:
        actual=np.zeros_like(native)
        for y in range(0,height,128):
            for x in range(0,width,128):
                ey=min(y+128,height);ex=min(x+128,width)
                sy,fy=window(height,y,ey);sx,fx=window(width,x,ex)
                tile=session.run(None,{'unary':unary[:,:,sy:fy,sx:fx].copy(),'image':image[:,:,sy:fy,sx:fx].copy(),'origin':np.array([sy,sx],np.float32)})[0]
                actual[:,y:ey,x:ex]=tile[:,y-sy:ey-sy,x-sx:ex-sx]
        parity=stats(native,actual)
        record['windowCases'].append({'width':width,'height':height,'tile':[128,128],'globalPoolingPhasePreserved':True,**parity})
        if parity['nonfinite'] or parity['maskChanges'] or parity['maxAbs']>1e-4:raise ValueError('Window CRF changed global decisions: '+str(record['windowCases'][-1]))
    record['model']={'file':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
    record['status']='native-and-ort-dynamic-crf-qualified'
except Exception as error:
    record['status']='failed';record['error']={'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
    raise
finally:
    record['elapsedMs']=(time.monotonic()-started)*1000
    record['scriptSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (HERE/'dynamic-crf-export.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps(record),flush=True)
