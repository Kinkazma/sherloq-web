from pathlib import Path
import argparse,sys,json
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.dont_write_bytecode=True;sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core.cloning2 import Cloning2Engine,COMBINED,EXTENDED,SYMMETRIC,EXTENDED_SYMMETRIC,render
out=Path(__file__).resolve().parents[1]/'.build/dense-pipeline-reference';out.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(522);rgb=rng.integers(0,256,(62,74,3),dtype=np.uint8);rgb[18:46,40:64]=rgb[10:38,8:32];rgb.tofile(out/'translation.rgb');records=[]
for kind in ('translation','reflection'):
 if kind=='reflection':rgb[18:46,40:64]=rgb[10:38,8:32][:,::-1];rgb.tofile(out/'reflection.rgb')
 engine=Cloning2Engine(rgb[:,:,::-1].copy())
 profiles=['PatchMatch Zernike','PatchMatch SIFT',COMBINED,EXTENDED,SYMMETRIC,EXTENDED_SYMMETRIC] if kind=='translation' else [EXTENDED_SYMMETRIC]
 for profile in profiles:
  params=(profile,400,100.,10.,.3,15.,'Similarity',3.,6,4,2,False,2.,True,False,False,(),())
  r=engine.analyze(params,(),False,lambda:False,lambda *a:None);stem=str(len(records));files={}
  for key in ('points','pairs','pair_search_regions','colors'):
   value=r.get(key)
   if value is not None:value.tofile(out/f'{stem}-{key}');files[key]=dict(file=f'{stem}-{key}',dtype=str(value.dtype),shape=value.shape)
  views=[]
  for style in [(0,100000,4,(),True,True,False,True,()),(0,100000,4,(0,),False,False,True,False,()),(30,40,6,(),False,True,False,True,(0,))]:
   pixels,visible,legend=render(rgb[:,:,::-1].copy(),r,style);file=f'{stem}-view-{len(views)}.rgb';pixels[:,:,::-1].copy().tofile(out/file);views.append(dict(file=file,style=style,visible=visible,legend=legend))
  records.append(dict(views=views,kind=kind,profile=profile,width=74,height=62,files=files,groups=[g.tolist() for g in r['groups']],models=r['models'],bases=r['bases'],dense_count=r['dense_count'],dense_consistent_count=r['dense_consistent_count']))
  print(kind,profile,len(r['pairs']),len(r['groups']),flush=True)
(out/'manifest.json').write_text(json.dumps(records,default=lambda x:x.item() if hasattr(x,'item') else x.tolist())+'\n')
