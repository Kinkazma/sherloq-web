"""Native ORB copy/move stages, rendering and heuristic count on public fields."""
from pathlib import Path
import argparse, json, sys
import numpy as np
import cv2 as cv
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent/'source'))
from gui.sherloq_app.core.cloning import CloningEngine, render
assert np.__version__ == '1.26.4' and cv.__version__ == '4.11.0'
parser=argparse.ArgumentParser();parser.add_argument('--binary-mask',action='store_true');args=parser.parse_args()
out = root/'.build/cloning-study'
reference = json.loads((out/'reference.json').read_text())
settings = [(90,20,15,5,False,False), (0,20,15,5,False,False),
            (50,20,15,5,False,False), (100,20,15,5,False,False),
            (90,1,15,5,False,False), (90,35,15,5,False,False),
            (90,20,1,5,False,False), (90,20,100,5,False,False),
            (90,20,15,1,False,False), (90,20,15,20,False,False),
            (90,20,15,5,True,False), (90,20,15,5,False,True),
            (90,20,15,5,True,True)]
records=[]
for image in reference['images']:
    if image['name'] not in ['flat','tiny','noise-193-127','clone-193-127','clone-512-384','shapes'] and not image['name'].startswith('large-'): continue
    rgb=np.fromfile(out/image['rgb'], np.uint8).reshape(image['height'], image['width'],3)
    bgr=cv.cvtColor(rgb,cv.COLOR_RGB2BGR); engine=CloningEngine(bgr)
    if args.binary_mask:cv.imwrite(str(out/(image['name']+'.png')),bgr)
    for mask_id,mask_name in enumerate(['all','half','sparse']):
        item=next(x for x in image['results'] if x['algorithm']==1 and x['mask']==mask_name)
        mask=np.fromfile(out/item['maskFile'],np.uint8).reshape(rgb.shape[:2]) if item['maskFile'] else None
        if args.binary_mask and mask is not None:
            cv.imwrite(str(out/(image['name']+'-'+mask_name+'-mask.png')),mask)
            mask=(mask>0).astype(np.uint8)
        for config in settings if mask_id==0 else [settings[0],settings[3],settings[12]]:
            params=(1,)+config
            result,stats=engine.analyze(params,mask_id,mask)
            prefix=('api-' if args.binary_mask else 'pipeline-')+str(len(records))
            response,matching,distance,minimum,show,hide=config
            points,desc=engine.selected.get((1,mask_id,response))
            raw=engine.matched.get((1,mask_id,response,matching))
            filtered,all_groups=engine.clustered.get((1,mask_id,response,matching,distance))
            groups=[g for g in all_groups if len(g)>=minimum]
            _,angles=render(bgr,points,filtered,groups,matching/100*255,False,True)
            np.asarray(points,dtype='<f8').tofile(out/(prefix+'-points.f64'))
            np.asarray(raw,dtype='<f8').tofile(out/(prefix+'-raw.f64'))
            np.asarray(filtered,dtype='<f8').tofile(out/(prefix+'-filtered.f64'))
            np.asarray([len(g) for g in all_groups],dtype='<u4').tofile(out/(prefix+'-lengths.u32'))
            np.asarray(np.concatenate(all_groups) if all_groups else [],dtype='<u4').tofile(out/(prefix+'-groups.u32'))
            angles.astype('<f4').tofile(out/(prefix+'-angles.f32'))
            cv.cvtColor(result,cv.COLOR_BGR2RGB).tofile(out/(prefix+'.rgb'))
            records.append(dict(image=image['name'],mask=mask_name,params=dict(zip(['response','matching','distance','minimum','showPoints','hideLines'],config)),prefix=prefix,stats=stats,std=float(np.std(angles)) if len(angles) else None))
    print(image['name'],len(records),flush=True)
(out/('api-reference.json' if args.binary_mask else 'pipeline-reference.json')).write_text(json.dumps(records,indent=2)+'\n')
