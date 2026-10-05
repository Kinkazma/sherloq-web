"""Check the complete historical 96MP drawing against the native render function."""
from pathlib import Path
import sys,json,time
import numpy as np,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning import render
kind=sys.argv[1] if len(sys.argv)>1 else 'orb';out=root/'.build/m3';start=time.time();record=json.loads((out/f'96mp-historical-{kind}.json').read_text());data=record['data'];params=record['provenance']['params'];image=cv2.imread(str(out/(sys.argv[2] if len(sys.argv)>2 else 'm3-96mp-noise-copy.jpg')))
points=np.array(data['points'],np.float64).reshape(-1,7);matches=np.array(data['matches'],np.float64).reshape(-1,3);groups=[];at=0
for size in data['groupLengths']:
 if size>=data['minimum']:groups.append(np.array(data['groupIndices'][at:at+size],np.int64))
 at+=size
assert at==len(data['groupIndices']);expected,_=render(image,points,matches,groups,params['matching']/100*255,params['showPoints'],params['hideLines']);height,width=image.shape[:2];del image
actual=cv2.imread(str(out/f'96mp-historical-{kind}.png'));assert actual.shape==expected.shape==(height,width,3);count=maximum=0
for y in range(0,height,32):
 d=np.abs(actual[y:y+32].astype(np.int16)-expected[y:y+32].astype(np.int16));count+=int(np.count_nonzero(d));maximum=max(maximum,int(d.max()))
assert count==0,(count,maximum)
report=dict(algorithm=kind,sourceSize=[width,height],stats=data['stats'],comparedBytes=width*height*3,differentBytes=count,maximumError=maximum,seconds=time.time()-start,scope='Native historical drawing of exported browser arrays; extraction and matching are independently qualified on smaller corpora.')
(root/'docs'/f'm3-96mp-historical-export-{kind}-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
