"""Native thumbnail comparison; write only the M5 owned JSON oracle."""
from pathlib import Path
import sys,json,hashlib,cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.thumbnail import analyze_thumbnail
assert cv.__version__=='4.11.0';cv.setNumThreads(1)
def rgb(w,h):
 y,x,c=np.indices((h,w,3),dtype=np.int32)
 return ((x*17+y*29+c*71+x*y*3)%256).astype(np.uint8)
sha=lambda a:hashlib.sha256(memoryview(a)).hexdigest()
cases=[]
sizes=[(1,1,17,9),(3,5,259,193),(31,17,1031,1024),(160,100,17,13),(13,11,16,32),(13,11,17,33),(13,11,31,65),(13,11,32,64),(97,83,1,137),(2,29,513,1)]
for i,(sw,sh,w,h) in enumerate(sizes):
 embedded=rgb(sw,sh);source=cv.cvtColor(rgb(w,h),cv.COLOR_RGB2BGR);ok,encoded=cv.imencode('.png',cv.cvtColor(embedded,cv.COLOR_RGB2BGR));assert ok
 resized,difference=analyze_thumbnail(encoded.tobytes(),source)
 cases.append(dict(name='synthetic-'+str(i),sourceWidth=sw,sourceHeight=sh,width=w,height=h,resizedSha256=sha(cv.cvtColor(resized,cv.COLOR_BGR2RGB)),differenceSha256=sha(cv.cvtColor(difference,cv.COLOR_BGR2RGB))))
file='tests/data/tiff-stream/tiles-bigtiff.tiff';source=cv.imread(str(root/file));embedded=rgb(31,17);ok,encoded=cv.imencode('.png',cv.cvtColor(embedded,cv.COLOR_RGB2BGR));assert ok
resized,difference=analyze_thumbnail(encoded.tobytes(),source)
large=dict(file=file,sourceWidth=31,sourceHeight=17,width=source.shape[1],height=source.shape[0],resizedSha256=sha(cv.cvtColor(resized,cv.COLOR_BGR2RGB)),differenceSha256=sha(cv.cvtColor(difference,cv.COLOR_BGR2RGB)))
(root/'tests/data/thumbnail-stream-native.json').write_text(json.dumps(dict(opencv=cv.__version__,nativeSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/thumbnail.py').read_bytes()).hexdigest(),cases=cases,large=large),indent=2)+'\n')
print(len(cases),'small cases and',large['width'],large['height'],'large native comparison')
