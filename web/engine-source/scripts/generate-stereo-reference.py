from pathlib import Path
import sys,json,hashlib,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.stereogram import StereoEngine
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(9744);cases=[]
specs=[('tiny',20,1,0),('flat',128,64,0),('random',128,96,0),('repeat',192,64,32),('patch',192,64,32),('odd',197,65,24),('small',36,2,12),('color',257,129,40),('short',192,31,32),('short63',192,63,32)]
specs += [('shape-'+str(i),w,h,period) for i,(w,h,period) in enumerate([(171,66,23),(174,67,23),(178,68,24),(241,127,31),(243,128,31),(247,129,31),(383,255,47),(389,256,47),(393,257,47),(511,511,61),(515,513,61),(516,514,64),(96,64,12),(99,65,12),(65,129,10),(63,130,10),(66,131,10),(1024,1024,64)])]
for name,w,h,period in specs:
 a=rng.integers(0,256,(h,w,3),np.uint8)
 if period:a=np.tile(a[:,:period],(1,(w+period-1)//period,1))[:,:w].copy()
 if name=='flat':a.fill(127)
 if name in ['patch','odd','color'] or name.startswith('shape-'):a[h//4:h*3//4,w//3:w*3//4]=np.roll(a,2,1)[h//4:h*3//4,w//3:w*3//4]
 file='stereo-'+name+'.rgb';(OUT/file).write_bytes(a[:,:,::-1].copy().tobytes());engine=StereoEngine(a);offset=engine.search();views=[]
 if offset is not None:
  for mode in range(4):views.append(hashlib.sha256(engine.compute(mode)[:,:,::-1].copy().tobytes()).hexdigest())
 flow=engine.flow;flow_file='stereo-'+name+'-flow.f32' if flow is not None else None
 if flow is not None:(OUT/flow_file).write_bytes(flow.tobytes())
 cases.append(dict(name=name,file=file,width=w,height=h,offset=offset,difference=engine.difference.tolist() if engine.difference is not None else None,views=views,flowFile=flow_file,flowSha256=hashlib.sha256(flow.tobytes()).hexdigest() if flow is not None else None));print(name,offset,flush=True)
(OUT/'stereo-reference.json').write_text(json.dumps(dict(schema=1,sourceSha256=hashlib.sha256((ROOT/'source/gui/sherloq_app/core/stereogram.py').read_bytes()).hexdigest(),cases=cases),separators=(',',':'))+'\n')
