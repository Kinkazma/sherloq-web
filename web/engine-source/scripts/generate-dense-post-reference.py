"""Reference full-field coherence and native display links on deterministic data."""
from pathlib import Path
import argparse,json,sys
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.dont_write_bytecode=True;sys.path.insert(0,str(args.native_gui));sys.path.insert(0,str(args.native_gui.parent))
from sherloq_app.core.dense_copy import coherent_mask
from sherloq_app.core.dense_links import sample_unique_links
out=Path(__file__).resolve().parents[1]/'.build/dense-post-reference';out.mkdir(parents=True,exist_ok=True)
records=[];rng=np.random.default_rng(519)
for case in ('translation','reflection','affine','random'):
 h,w=41,53;yy,xx=np.mgrid[:h,:w];squared=np.full((h,w),.01,np.float32)
 if case=='translation': tx=xx+9;ty=yy+2
 elif case=='reflection':tx=w-1-xx;ty=yy
 elif case=='affine':tx=xx+yy//2;ty=yy+3
 else:tx=rng.integers(0,w,(h,w));ty=rng.integers(0,h,(h,w))
 targets=np.where((tx<w)&(ty<h),ty*w+tx,-1).astype(np.int32);targets[12:14,11:15]=-1;squared[30:32,20:23]=.9
 for radius in (2,6):
  for error in (0.,.3,3.):
   stem=f'{case}-r{radius}-e{error}';selected,errors=coherent_mask(targets,squared,.3,error,radius,6)
   for name,array in [('targets.i32',targets),('squared.f32',squared),('selected.u8',selected.astype(np.uint8)),('errors.f32',errors)]:array.tofile(out/(stem+'-'+name))
   rows,total=sample_unique_links(targets,squared,selected,17);rows.astype(np.int32).tofile(out/(stem+'-rows.i32'))
   records.append(dict(stem=stem,width=w,height=h,radius=radius,errorThreshold=error,total=total))
(out/'manifest.json').write_text(json.dumps(records,indent=2)+'\n');print(len(records))
