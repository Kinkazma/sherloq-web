"""Native TensorFlow CPU references, isolated from checkpoint-export imports."""
from pathlib import Path
import sys,json,faulthandler
import numpy as np
faulthandler.dump_traceback_later(45,exit=True)
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.noiseprint.noiseprint import genNoiseprint,configSess
configSess.device_count['GPU']=0
out=root/'.build/noiseprint';manifest=json.loads((out/'manifest.json').read_text());cases=[]
for quality in [51,90,95,100,101]:
 print('Native reference',quality,flush=True)
 gray=np.random.default_rng(quality).uniform(0,1,(53,61)).astype(np.float32);noise=genNoiseprint(gray,quality)
 gray.tofile(out/f'gray-{quality}.f32');noise.tofile(out/f'noise-{quality}.f32');cases.append(dict(quality=quality,width=61,height=53,gray=f'gray-{quality}.f32',noise=f'noise-{quality}.f32'))
manifest.update(cases=cases,referenceBackend='Native TensorFlow CPU');(out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n');faulthandler.cancel_dump_traceback_later()
