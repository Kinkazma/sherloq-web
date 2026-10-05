from pathlib import Path
import sys,json
import numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));out=root/'.build/m3';cv.setNumThreads(2)
from gui.sherloq_app.core.cloning2 import Cloning2Engine,render
from gui.sherloq_app.core.auto_zones import detect_panels
from gui.sherloq_app.core.text_regions import detect_text
texture=np.fromfile(out/'sparse-rgb.bin',np.uint8).reshape(176,224,3)[:,:,::-1].copy();image=np.full((300,700,3),255,np.uint8);image[90:266,25:249]=texture;image[90:266,425:649]=texture[:,::-1]
for x,label in [(25,'SAMPLE A'),(425,'SAMPLE B')]:cv.putText(image,label,(x,53),cv.FONT_HERSHEY_SIMPLEX,.9,(0,0,0),2,cv.LINE_AA)
print('Panels',detect_panels(image),flush=True);print('Text',detect_text(image),flush=True);image[:,:,::-1].copy().tofile(out/'panels-text-positive-rgb.bin')
algorithm='SIFT + G2NN + RANSAC + Panels + Text';p=(algorithm,300,1000.,5.,.7,50.,'Affine',3.,4,8,8,True,2.,True,False,False,(),(),1,True);r=Cloning2Engine(image).analyze(p);style=(0.,10000.,4,(),True,True,True,True,(),True);rgb,visible,legend=render(image,r,style);rgb[:,:,::-1].copy().tofile(out/'panels-text-positive.rgb');assert len(r['groups']) and len(r['preprocessing']['text_boxes'])
record=dict(width=700,height=300,options=dict(algorithm=algorithm,limit=300,radius=1000.,minimum=5.,threshold=.7,tolerance=50.,model='Affine',geometricThreshold=3.,geometricMinimum=4,reflections=True),pairs=r['pairs'].tolist(),owners=r['pair_search_regions'].tolist(),groups=[g.tolist() for g in r['groups']],preprocessing=r['preprocessing'],regions=r['regions'],visible=visible,legend=legend)
(out/'panels-text-positive-reference.json').write_text(json.dumps(record));print(dict(groups=len(r['groups']),pairs=len(r['pairs'])),flush=True)
