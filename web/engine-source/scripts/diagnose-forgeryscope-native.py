"""Native intermediates for the two actual M2/M5 counterexamples, local only."""
from pathlib import Path
import os,sys,json,hashlib
import numpy as np,torch
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope-diagnostics';out.mkdir(parents=True,exist_ok=True)
config=out/'yolo-config';(config/'Ultralytics').mkdir(parents=True,exist_ok=True)
os.environ.update(YOLO_CONFIG_DIR=str(config),YOLO_AUTOINSTALL='false',YOLO_OFFLINE='true')
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.forgeryscope_adapter import load,predict
torch.set_num_threads(2);loaded=load('cpu');extract=loaded['blot'].extractor.extract;forward=loaded['blot'].matcher.forward
records=[];current=None
def save(name,value):
    if isinstance(value,torch.Tensor):
        array=value.detach().cpu().numpy();file=name+'.bin';array.tofile(out/file)
        return dict(file=file,shape=list(array.shape),dtype=str(array.dtype))
    if isinstance(value,dict):return {k:save(name+'-'+k,v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [save(name+'-'+str(i),v) for i,v in enumerate(value)]
    return value
def extracted(image,**kwargs):
    value=extract(image,**kwargs);index=len(current['extracts'])
    current['extracts'].append(dict(input=save(current['id']+'-input-'+str(index),image),output=save(current['id']+'-features-'+str(index),value)))
    return value
def matched(data):
    value=forward(data);current['matches'].append(save(current['id']+'-match-'+str(len(current['matches'])),value));return value
loaded['blot'].extractor.extract=extracted;loaded['blot'].matcher.forward=matched
for ref_file,ident,profile in [('public-reference.json','duplicate','Forgeryscope blots complets'),('positive-reference.json','auto','Forgeryscope Auto')]:
    c=next(x for x in json.loads((root/'.build/forgeryscope'/ref_file).read_text())['cases'] if x['id']==ident)
    image=np.fromfile(root/'.build/forgeryscope'/c['file'],np.uint8).reshape(c['height'],c['width'],3)
    current=dict(id=ident,extracts=[],matches=[])
    value=predict(image[:,:,::-1].copy(),loaded,profile,panels=c.get('panels'))
    current['metadata']=value['metadata'];records.append(current)
    print(ident,len(current['extracts']),len(current['matches']),flush=True)
(out/'native.json').write_text(json.dumps(dict(cases=records),separators=(',',':'))+'\n')
