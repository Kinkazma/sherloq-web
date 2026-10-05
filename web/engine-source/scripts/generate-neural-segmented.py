"""Actual native inference on decoded public JPEG; expected arrays never enter inference."""
from pathlib import Path
import hashlib,json,sys,time
import numpy as np
import cv2 as cv
import torch,torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_models import load_segmentation
from gui.sherloq_app.core.clone_detectors import analyze
from gui.sherloq_app.core.d2prl import load as load_d2,postprocess
variant=sys.argv[1];d2=variant=='d2prl';large='--large' in sys.argv;rich='--rich' in sys.argv;assert not rich or large
out=root/'.build/neural-segmented'/((variant+'-large'+('-rich' if rich else '')) if large else variant);out.mkdir(parents=True,exist_ok=True)
def denied(*a,**k):raise RuntimeError('Offline native reference only')
torch.hub.download_url_to_file=denied;torch.utils.model_zoo.load_url=denied;torch.set_num_threads(8)
base=root/'.build'/('d2prl-model-zones' if d2 else 'segmentation-zones' if variant=='mgcfdn-mpdn' else 'segmentation-zones-'+variant)
ref=json.loads((base/'reference.json').read_text())
if rich:
    # Deterministic public copy structures enlarged across the real 96MP source.
    # The native network still performs its own unmodified 256/512 preparation.
    spec=ref['source'];source=np.fromfile(base/spec['file'],np.uint8).reshape(spec['shape'])
    assert hashlib.sha256(source.tobytes()).hexdigest()==spec['sha256']
    height,width=8000,12000;stem='neural-96mp-'+spec['sha256'][:16];file=root/'.build'/(stem+'.jpg')
    if not file.exists():
        scaled=cv.resize(source,(width,height),interpolation=cv.INTER_NEAREST)
        rng=np.random.default_rng(320094)
        for y in range(0,height,64):
            part=scaled[y:y+64];part[:]=np.clip(part.astype(np.int16)+rng.integers(-4,5,size=part.shape,dtype=np.int16),0,255).astype(np.uint8)
        ok,encoded=cv.imencode('.jpg',scaled[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,93]);assert ok
        file.write_bytes(encoded.tobytes());del scaled,encoded
    original=file.read_bytes();original_path='../../'+file.name
elif large:
    original=(root/'.build/jpeg-12000x8000.jpg').read_bytes()
    original_path='../../jpeg-12000x8000.jpg'
else:
    base=root/'.build'/('d2prl-model-zones' if d2 else 'segmentation-zones' if variant=='mgcfdn-mpdn' else 'segmentation-zones-'+variant)
    ref=json.loads((base/'reference.json').read_text());spec=ref['source'];rgb=np.fromfile(base/spec['file'],np.uint8).reshape(spec['shape'])
    ok,encoded=cv.imencode('.jpg',rgb[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,93]);assert ok
    original=encoded.tobytes();(out/'source.jpg').write_bytes(original);original_path='source.jpg'
image=cv.imdecode(np.frombuffer(original,np.uint8),cv.IMREAD_COLOR);h,w=image.shape[:2]
if rich:
    source_height,source_width=spec['shape'][:2]
    zones=[dict(id=z['id'],kind='region',bounds=[round(z['bounds'][i]*([w,h][i%2])/([source_width,source_height][i%2])) for i in range(4)]) for z in ref['zones'][:2]]
    zones.append(dict(id='full-envelope',kind='envelope',bounds=[0,0,w,h]))
else:zones=[dict(id='whole-image',kind='whole-image',bounds=[0,0,w,h])] if large else ref['zones']
zones=[{k:z[k] for k in ('id','kind','bounds')} for z in zones]
exclusions=[] if not d2 or large else [[201,157,251,217],[0,0,8,h]]
polygon=lambda b:[[b[0],b[1]],[b[2]-1,b[1]],[b[2]-1,b[3]-1],[b[0],b[3]-1]]
if d2:native='D2PRL';loaded=load_d2('cpu')
else:native=ref['variant'];loaded=load_segmentation(native,'cpu')
class Single:
    def get(self,name,requested):assert name==native and requested=='cpu';return loaded,True
start=time.monotonic();result=analyze(image,dict(variant=native,regions=[] if large and not rich else [polygon(z['bounds']) for z in zones],excluded=[polygon(b) for b in exclusions]),'cpu',Single(),lambda i,n:print(variant,i,n,flush=True) if i==n else None)
def save(name,a):
    a=np.ascontiguousarray(a);data=a.tobytes();filename=name+'.bin';(out/filename).write_bytes(data);return dict(file=filename,shape=list(a.shape),dtype=str(a.dtype),bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
fields=['map','mask','analyzed','candidates']+(['target','source'] if d2 or loaded['kind']=='softmax' else [])
records=[dict(name='detect',outputs={k:save('detect-'+k,result[k]) for k in fields},minimum=500)]
raws=result['raw_probabilities']
if not large or rich:
    selected=zones if d2 else zones[:2]
    arrays={k:np.zeros((h,w),np.uint8 if k in ('mask','analyzed','candidates') else np.float32) for k in fields}
    for z,raw in zip(selected,raws):
        x0,y0,x1,y1=z['bounds'];size=(x1-x0,y1-y0)
        if d2:
            masks=postprocess(raw,17);values=dict(map=raw[0],mask=masks[0],target=masks[1],source=masks[2])
        elif loaded['kind']=='softmax':values=dict(map=raw[0]+raw[1],mask=((raw[0]>=.5)|(raw[1]>=.5)).astype(np.uint8),target=raw[0],source=raw[1])
        else:values=dict(map=raw[0],mask=(raw[0]>.5).astype(np.uint8))
        for k,a in values.items():np.maximum(arrays[k][y0:y1,x0:x1],cv.resize(a,size,interpolation=cv.INTER_NEAREST if k=='mask' or d2 and k!='map' else cv.INTER_LINEAR),out=arrays[k][y0:y1,x0:x1])
        arrays['analyzed'][y0:y1,x0:x1]=1
    for x0,y0,x1,y1 in exclusions:
        for a in arrays.values():a[y0:y1,x0:x1]=0
    records.append(dict(name='refilter' if d2 else 'reproject',minimum=17 if d2 else 500,outputs={k:save('cached-'+k,a) for k,a in arrays.items()}))
record=dict(schema=1,variant=variant,width=w,height=h,mode='whole-image' if large and not rich else 'regions',original=dict(file=original_path,bytes=len(original),sha256=hashlib.sha256(original).hexdigest()),pixelSha256=hashlib.sha256(cv.cvtColor(image,cv.COLOR_BGR2RGB).tobytes()).hexdigest(),zones=zones,exclusions=exclusions,raw=[save('raw-'+str(i),a) for i,a in enumerate(raws)],records=records,foreground=int(np.count_nonzero(result['mask'])),rich96mp=rich,nativeSeconds=time.monotonic()-start,torch=torch.__version__,opencv=cv.__version__,scope='Actual native model inference from decoded synthetic JPEG, complete source-coordinate outputs; no private pictures, network or training.')
(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(variant,'complete',round(record['nativeSeconds'],3),'foreground',record['foreground'],flush=True)
