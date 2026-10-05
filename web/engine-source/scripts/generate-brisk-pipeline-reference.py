from pathlib import Path
import sys,json,numpy as np,cv2
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));cv2.setNumThreads(2)
from gui.sherloq_app.core.cloning import CloningEngine
out=root/'.build/m3';original=np.fromfile(out/'sparse-positive-rgb.bin',np.uint8).reshape(176,448,3)[:,:,::-1].copy();cases=[]
for name,image,mask in [('copy',original,None),('masked',original,np.tile(np.r_[np.zeros(50,np.uint8),np.ones(398,np.uint8)],(176,1))),('empty',original,np.zeros((176,448),np.uint8)),('flat',np.zeros((96,128,3),np.uint8),None)]:
 cv2.imwrite(str(out/f'brisk-{name}.png'),image)
 if mask is not None:cv2.imwrite(str(out/f'brisk-{name}-mask.png'),mask)
 engine=CloningEngine(image)
 for i,(response,matching,minimum,show,hide) in enumerate([(50,15,4,True,False),(50,15,2,False,True)] if name in ['copy','masked'] else [(90,20,5,True,False)]):
  params=(0,response,matching,15,minimum,show,hide);result,stats=engine.analyze(params,mask_id=1 if mask is not None else 0,mask=mask);key=(0,1 if mask is not None else 0);points,desc=engine.selected.get(key+(response,));matches,groups=engine.clustered.get(key+(response,matching,15));prefix=f'brisk-{name}-{i}'
  for suffix,a in [('points',points.astype('<f8')),('descriptors',desc),('matches',matches.astype('<f8')),('lengths',np.asarray([len(g) for g in groups],np.uint32)),('groups',np.asarray(np.concatenate(groups) if groups else [],np.uint32)),('rgb',result[:,:,::-1].copy())]:a.tofile(out/f'{prefix}-{suffix}.bin')
  cases.append(dict(name=name,prefix=prefix,width=image.shape[1],height=image.shape[0],file=f'brisk-{name}.png',maskFile=f'brisk-{name}-mask.png' if mask is not None else None,params=dict(response=response,matching=matching,distance=15,minimum=minimum,showPoints=show,hideLines=hide),stats=stats));print(prefix,stats,flush=True)
(out/'brisk-pipeline-reference.json').write_text(json.dumps(cases,separators=(',',':')))
