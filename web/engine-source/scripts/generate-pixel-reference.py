"""Native pixel-tool oracles. Only generated images; never reads private images."""
from pathlib import Path
from itertools import product
import hashlib, json, sys, tempfile
import numpy as np
import cv2 as cv
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.histogram import analyze_histogram
from gui.sherloq_app.core.pixel_stats import StatsEngine
from gui.sherloq_app.core.bit_planes import PlanesEngine
from gui.sherloq_app.core.minmax import MinMaxEngine
from gui.sherloq_app.core.defect_pixels import DefectEngine, export_csv
OUT=ROOT/'web-engine/fixtures'
def sha(b):return hashlib.sha256(b).hexdigest()
def rgbsha(bgr):return sha(np.ascontiguousarray(bgr[:,:,::-1]).tobytes())
def summary(y,start,end,total):
    start,end=sorted((start,end));x=np.arange(start,end+1);y=y[start:end+1];count=np.sum(y)
    if count:
        argmin=int(np.argmin(y)+start);argmax=int(np.argmax(y)+start)
        mean=float(np.round(np.sum(x*y)/count,2));stddev=float(np.round(np.sqrt(np.sum(((x-mean)**2)*y)/count),2))
        median=int(np.argmax(np.cumsum(y)>count/2)+start);percent=float(np.round(count/total*100,2))
        empty=int(len(x)-np.count_nonzero(y));nonzero=[int(np.nonzero(y)[0][0]+start),int(np.nonzero(y)[0][-1]+start)]
        fullness=float(np.round(count/(len(y)*np.max(y))*100,2));y=y/np.max(y);smoothness=0
        if len(y)>=5:
            for i in range(2,len(y)-2):smoothness+=abs(y[i]-((2*y[i-1]-y[i-2])+(2*y[i+1]-y[i+2]))/2)
            smoothness=float(np.round((1-smoothness/(len(y)-2))*100,2))
    else:argmin=argmax=mean=stddev=median=percent=smoothness=fullness=0;empty=len(x);nonzero=[]
    return dict(start=start,end=end,argmin=argmin,argmax=argmax,mean=mean,stddev=stddev,median=median,count=int(count),percent=percent,nonzero=nonzero,empty=empty,smoothness=smoothness,fullness=fullness)
rng=np.random.default_rng(7391)
defects=np.full((35,33,3),100,np.uint8)
for y,x,v in [(8,8,[240,10,100]),(17,17,[0,0,0]),(25,25,[255,255,255]),(0,4,[255,0,255]),(34,20,[0,255,0]),(2,28,[132,68,100])]:defects[y,x]=v
patterns=[('random-odd',rng.integers(0,256,(19,17,3),dtype=np.uint8)),('ties',np.array(list(product((0,127,255),repeat=3)),np.uint8).reshape(3,9,3)),('black',np.zeros((1,1,3),np.uint8)),('white',np.full((1,1,3),255,np.uint8)),('flat',np.full((13,11,3),127,np.uint8)),('row',rng.integers(0,256,(1,9,3),dtype=np.uint8)),('column',rng.integers(0,256,(9,1,3),dtype=np.uint8)),('two',rng.integers(0,256,(2,2,3),dtype=np.uint8)),('defects',defects)]
cases=[]
with tempfile.TemporaryDirectory(prefix='sherloq-pixel-reference-') as temp:
    for name,rgb in patterns:
        path='pixels-'+name+'.rgb';raw=np.ascontiguousarray(rgb).tobytes();(OUT/path).write_bytes(raw)
        bgr=np.ascontiguousarray(rgb[:,:,::-1]);stats=StatsEngine(bgr);planes=PlanesEngine(bgr);extrema=MinMaxEngine(bgr);defect=DefectEngine(bgr,backend='cpu');expected=[]
        for mode,inclusive in product(('min','avg','max'),(False,True)):
            expected.append(dict(operation='colors.stats',params=dict(mode=mode,inclusive=inclusive),pixels=rgbsha(stats.compute((mode,inclusive)))))
        for channel,bit,filtering in product(range(5),range(8),range(3)):
            rawplane=((planes.channel(channel)>>bit)&1).astype(np.uint8)
            expected.append(dict(operation='noise.planes',params=dict(channel=channel,bit=bit,filter=filtering),pixels=rgbsha(planes.compute((channel,bit,filtering))),masks={'plane':sha(rawplane.tobytes())}))
        params=set(product(range(5),(1,),(0,),range(6)))|set(product((0,),range(5),range(5),(0,1,5)))
        for channel,minimum,maximum,filtering in sorted(params):
            output,low,high=extrema.compute((channel,minimum,maximum,filtering))
            expected.append(dict(operation='noise.minmax',params=dict(channel=channel,minimum=minimum,maximum=maximum,filter=filtering),pixels=rgbsha(output),masks={'minimum':sha(low.tobytes()),'maximum':sha(high.tobytes())}))
        for radius,kind,mode,(threshold,spread) in product((1,2),range(3),range(3),((1,0),(32,32),(255,255))):
            settings=(radius,threshold,spread,kind,True);output,flags,count,median=defect.compute((settings,mode));csv_path=Path(temp)/'candidates.csv';export_csv(csv_path,settings,bgr,flags,median)
            expected.append(dict(operation='pixels.defects',params=dict(radius=radius,threshold=threshold,spread=spread,kind=kind,mode=mode),pixels=rgbsha(output),flags=rgbsha(flags),count=count,masks={'candidates':sha(np.bitwise_or.reduce(flags,axis=2).tobytes())},csvSha256=sha(csv_path.read_bytes())))
        hist,unique,ratio=analyze_histogram(bgr)
        for channel,(start,end) in product(range(4),((0,255),(80,180),(127,127),(255,250))):
            expected.append(dict(operation='inspection.histogram',params=dict(channel=channel,start=start,end=end),bins=hist.tolist(),uniqueColors=int(unique),uniqueRatio=float(ratio),summary=summary(hist[channel],start,end,rgb.shape[0]*rgb.shape[1])))
        cases.append(dict(name=name,width=rgb.shape[1],height=rgb.shape[0],file=path,sha256=sha(raw),expected=expected))
sources={}
for name in ('histogram','pixel_stats','bit_planes','minmax','defect_pixels','utility'):
    path='source/gui/sherloq_app/core/'+name+'.py';sources[path]=sha((ROOT/path).read_bytes())
path='source/gui/sherloq_app/tools/inspection/histogram.py';sources[path]=sha((ROOT/path).read_bytes())
report=dict(schema=1,source='generated patterns and seeded noise only',opencv=cv.__version__,numpy=np.__version__,sources=sources,cases=cases)
(OUT/'pixel-reference.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps(dict(cases=len(cases),outputs=sum(len(c['expected']) for c in cases))))
