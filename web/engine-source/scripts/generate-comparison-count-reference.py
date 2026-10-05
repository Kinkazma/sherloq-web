"""Exercise native histogram correction beyond float32's exact integer range."""
from pathlib import Path
import sys,json,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.comparison import HistogramPair
w=h=4097;cases=[]
for name,first,second in [('same',[(0,0,0),(0,0,0)],[(0,0,0),(0,0,0)]),('rare',[(0,0,0),(255,255,255)],[(255,255,255),(255,255,255)]),('disjoint',[(0,0,0),(0,0,0)],[(255,255,255),(255,255,255)])]:
 a=np.zeros((h,w,3),np.uint8);b=np.zeros_like(a)
 if name=='disjoint':b.fill(255)
 else:
  a.reshape(-1,3)[-2:]=first;b.reshape(-1,3)[-2:]=second
 pair=HistogramPair(a,b);assert pair.exact
 values=[pair.compare(mode) for mode in [0,1,4,2,3,5]]
 cases.append(dict(name=name,width=w,height=h,firstTail=first,secondTail=second,values=values));print(name,values,flush=True)
(ROOT/'web-engine/fixtures/comparison-count-reference.json').write_text(json.dumps(dict(schema=1,pixels=w*h,cases=cases),indent=2)+'\n')
