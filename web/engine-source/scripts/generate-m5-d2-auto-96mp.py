"""Reuse real native D2PRL grids; qualify M5 exclusions/regions without repeating inference."""
from pathlib import Path
import argparse,hashlib,json,shutil,sys,time
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
from gui.sherloq_app.core.d2prl_regions import regions as native_regions
parser=argparse.ArgumentParser();parser.add_argument('--native',type=Path,default=root.parent/'web-engine/.build/neural-segmented/d2prl-large-rich/reference.json');args=parser.parse_args()
reference=json.loads(args.native.read_text());base=args.native.parent
assert reference['variant']=='d2prl' and reference['rich96mp'] and [reference['width'],reference['height']]==[12000,8000]
out=root/'.build/integration/large-d2-auto';out.mkdir(parents=True,exist_ok=True)
source=(base/reference['original']['file']).resolve();source_bytes=source.read_bytes()
assert hashlib.sha256(source_bytes).hexdigest()==reference['original']['sha256']=='03c0b3127e021f2b8f88cbe044545e0de2127fcdae8a62cd36182821180f2ccb'
if not (out/'source.jpg').exists():shutil.copyfile(source,out/'source.jpg')
assert hashlib.sha256((out/'source.jpg').read_bytes()).hexdigest()==reference['original']['sha256']
image=cv.imdecode(np.frombuffer(source_bytes,np.uint8),cv.IMREAD_COLOR);h,w=image.shape[:2]
assert hashlib.sha256(cv.cvtColor(image,cv.COLOR_BGR2RGB).tobytes()).hexdigest()==reference['pixelSha256'];del image,source_bytes
zones=reference['zones'];assert len(zones)==3 and zones[-1]['bounds']==[0,0,w,h]
small=json.loads((root.parent/'web-engine/.build/d2prl-model-zones/reference.json').read_text());sh,sw=small['source']['shape'][:2]
expected=[dict(id=z['id'],kind='region',bounds=[round(z['bounds'][i]*([w,h][i%2])/([sw,sh][i%2])) for i in range(4)]) for z in small['zones'][:2]]
assert [z['bounds'] for z in zones[:2]]==[z['bounds'] for z in expected]
exclusions=[[round(201*w/sw),round(157*h/sh),round(251*w/sw),round(217*h/sh)],[0,0,round(8*w/sw),h]]
raws=[]
for spec in reference['raw']:
    data=(base/spec['file']).read_bytes();assert len(data)==spec['bytes'] and hashlib.sha256(data).hexdigest()==spec['sha256'];raws.append(np.frombuffer(data,np.float32).reshape(spec['shape']))
assert len(raws)==len(zones) and all(a.shape==(3,448,448) for a in raws)
def save(name,a):
    a=np.ascontiguousarray(a);filename=name+'.bin';a.tofile(out/filename);digest=hashlib.sha256()
    with (out/filename).open('rb') as stream:
        for chunk in iter(lambda:stream.read(4*1024**2),b''):digest.update(chunk)
    return dict(file=filename,shape=list(a.shape),dtype=str(a.dtype),bytes=a.nbytes,sha256=digest.hexdigest())
def entries(arrays,minimum):
    found=native_regions(dict(mask=arrays['mask'],metadata=dict(min_component=minimum,boxes=[z['bounds'] for z in zones])),minimum);output=[]
    for item in found:
        item=dict(item);mask=item.pop('pixel_mask');item['pixel_mask']=dict(width=mask.shape[1],height=mask.shape[0],sha256=hashlib.sha256(mask.tobytes()).hexdigest());output.append(item)
    return output
fields=['map','mask','analyzed','candidates','target','source'];records=[];started=time.monotonic()
for minimum,prefix in [(500,'detect'),(17,'cached')]:
    arrays={k:np.zeros((h,w),np.uint8 if k in ('mask','analyzed','candidates') else np.float32) for k in fields}
    for z,raw in zip(zones,raws):
        x0,y0,x1,y1=z['bounds'];masks=postprocess(raw,minimum)
        for k,a in dict(map=raw[0],mask=masks[0],target=masks[1],source=masks[2]).items():
            np.maximum(arrays[k][y0:y1,x0:x1],cv.resize(a,(x1-x0,y1-y0),interpolation=cv.INTER_LINEAR if k=='map' else cv.INTER_NEAREST),out=arrays[k][y0:y1,x0:x1])
        arrays['analyzed'][y0:y1,x0:x1]=1
    for x0,y0,x1,y1 in exclusions:
        for a in arrays.values():a[y0:y1,x0:x1]=0
    records.append(dict(name='detect' if minimum==500 else 'refilter',minimum=minimum,outputs={k:save(prefix+'-'+k,a) for k,a in arrays.items()},entries=entries(arrays,minimum),foreground=int(np.count_nonzero(arrays['mask']))))
    if minimum==17:
        h32=hashlib.sha256()
        for y in range(0,h,64):h32.update(arrays['mask'][y:y+64].astype('<u4').tobytes())
        corroboration=dict(root_corroboration_counts=records[-1]['outputs']['mask']['sha256'],root_corroboration_context_counts=h32.hexdigest())
    del arrays
record=dict(schema=1,variant='d2prl',width=w,height=h,original={**reference['original'],'file':'source.jpg'},pixelSha256=reference['pixelSha256'],zones=zones,exclusions=exclusions,raw=[save('raw-'+str(i),a) for i,a in enumerate(raws)],records=records,rich96mp=True,nativeInferenceReference=dict(file=str(args.native),sha256=hashlib.sha256(args.native.read_bytes()).hexdigest(),nativeSeconds=reference['nativeSeconds'],torch=reference['torch']),nativeAssemblySeconds=time.monotonic()-started,opencv=cv.__version__,corroboration=corroboration,scope='Actual native M1 model grids on identical source/zones, native full-resolution composition, output-only exclusions, native component masks/contours. No repeated neural inference, training or private pictures.')
(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print('D2PRL native assembly',round(record['nativeAssemblySeconds'],3),[r['foreground'] for r in records],flush=True)
