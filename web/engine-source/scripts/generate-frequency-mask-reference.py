from pathlib import Path
import sys,json,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.frequency_mask import circular_mask
OUT=ROOT/'web-engine/fixtures';cases=[]
for filename in ['frequency-reference.json','frequency-large-reference.json']:
 for f in json.loads((OUT/filename).read_text())['cases']:
  blob=bytearray(); masks=[];seen=set()
  for e in f['expected']:
   p=e['params'];key=(p['split'],p['smooth'])
   if key in seen:continue
   seen.add(key);a=circular_mask(f['baseShape'][:2],*key);b=a.tobytes();masks.append(dict(split=key[0],smooth=key[1],offset=len(blob),length=len(b)));blob.extend(b)
  file='frequency-mask-'+f['name']+'.f32';(OUT/file).write_bytes(blob);cases.append(dict(name=f['name'],file=file,masks=masks));print(f['name'],len(masks),flush=True)
(OUT/'frequency-mask-reference.json').write_text(json.dumps(dict(schema=1,cases=cases),indent=2)+'\n')
