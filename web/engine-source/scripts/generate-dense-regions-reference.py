"""Native ROI/texture/gutter reference; local outputs, no source/cache writes."""
from pathlib import Path
import argparse,json,sys
import numpy as np
import cv2 as cv
sys.dont_write_bytecode=True
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core.cloning2 import polygon_mask
from sherloq_app.core.auto_zones import compact_axes,distance_policy
out=Path(__file__).resolve().parents[1]/'.build/dense-regions-reference';out.mkdir(parents=True,exist_ok=True)
h,w=47,59;rng=np.random.default_rng(177);rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8);rgb[5:20,4:20]=64;rgb.tofile(out/'rgb.u8')
polys=[[[.5,1.5],[31.5,2.5],[27,39.5],[2,32]],[[25,5],[57,5],[55,45],[26,40]]];ex=[[[11,9],[17,9],[17,14],[11,14]]]
records=[]
for method,patch,target in [(0,3,3),(0,8,8),(1,3,3),(1,4,6),(1,8,6)]:
 for region_count in (0,1,2):
  for texture in (0.,2.,60.):
   regions=polys[:region_count];support=max(patch,target);shift=1.5*support if method else 0.;dh,dw=h-3*support*method,w-3*support*method
   allowed=np.zeros((dh,dw),np.uint8) if regions else np.ones((dh,dw),np.uint8)
   rows=np.rint(shift+np.arange(dh)).astype(int);cols=np.rint(shift+np.arange(dw)).astype(int)
   for j,poly in enumerate(regions):allowed|=(polygon_mask((h,w),(poly,))[np.ix_(rows,cols)]>0).astype(np.uint8)*(1<<j)
   allowed[polygon_mask((h,w),ex)[np.ix_(rows,cols)]>0]=0
   if texture:
    gray=rgb.astype(np.float32).mean(2);size=(2*patch+1,)*2;dev=np.sqrt(np.maximum(cv.boxFilter(gray*gray,-1,size)-cv.boxFilter(gray,-1,size)**2,0));allowed[dev[np.ix_(rows,cols)]<texture]=0
   name=f'{len(records)}.u8';allowed.tofile(out/name);records.append(dict(file=name,method=method,patch=patch,targetPatch=target,regions=regions,excluded=ex,texture=texture))
axes=compact_axes((h,w),polys)
for i,axis in enumerate(axes):axis.tofile(out/f'axis{i}.f32')
(out/'manifest.json').write_text(json.dumps(dict(width=w,height=h,polys=polys,records=records),indent=2)+'\n');print(len(records))
