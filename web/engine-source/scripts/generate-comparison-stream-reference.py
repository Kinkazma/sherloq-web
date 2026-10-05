"""One large decoded JPEG pair; all generated files remain in this worktree."""
from pathlib import Path
import sys,json,hashlib,warnings,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.comparison import ComparisonEngine
out=root/'.build/comparison-stream';out.mkdir(parents=True,exist_ok=True)
fixture=next(r for r in json.loads((root/'fixtures/comparison-reference.json').read_text())['cases'] if r['name']=='megapixel');images=[]
for key in ['first','second']:
 rgb=np.fromfile(root/'fixtures'/fixture[key],np.uint8).reshape(fixture['height'],fixture['width'],3);file=out/(key+'.jpg');assert cv.imwrite(str(file),rgb[:,:,::-1],[cv.IMWRITE_JPEG_QUALITY,95]);images.append(cv.imread(str(file)))
engine=ComparisonEngine(*images)
with warnings.catch_warnings():warnings.simplefilter('ignore');result=engine.compute()
values={k:(float(v) if np.isfinite(v) else '+Infinity') for k,v in result['values'].items()};views=[]
for mode in ['normal','difference','ssim','butter']:
 for equalized,gray in [(False,False),(True,True)]:views.append(dict(mode=mode,equalized=equalized,grayscale=gray,sha256=hashlib.sha256(engine.display(mode,equalized,gray)[:,:,::-1].copy().tobytes()).hexdigest()))
(out/'reference.json').write_text(json.dumps(dict(width=fixture['width'],height=fixture['height'],values=values,errors={k:str(v) for k,v in result['errors'].items()},views=views),indent=2)+'\n');print('Generated',len(values),'metrics',len(views),'views',flush=True)
