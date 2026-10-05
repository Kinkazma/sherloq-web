from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path.insert(0,'/Users/gaeldauchy/SHERLOQ/source')
import numpy as np,cv2 as cv
from gui.sherloq_app.core import noisesniffer as ns
root=Path(__file__).resolve().parents[1];out=root/'.build/noisesniffer-96mp';out.mkdir(exist_ok=True);source=root/'.build/dense-96mp/copy-6000.jpg';bgr=cv.imread(str(source));started=time.monotonic();last=[-1]
def progress(n,phase):
 if n!=last[0]:print(phase,n,time.monotonic()-started,flush=True);last[0]=n
stats=ns.statistics(bgr,8,folder=out,progress=progress);print('statistics done',flush=True);V,S=ns.select(bgr,8,20000,.25,.5,stats);print('selection done',len(V),len(S),flush=True);all_blocks,low=ns.counts(bgr.shape,8,50,V,S);mask,regions=ns.regions(bgr.shape,8,50,.5,all_blocks,low);distribution=ns.distribution(bgr,8,V,S);rgb=bgr[:,:,::-1].copy();selected=mask>0;rgb[selected]=(rgb[selected].astype(np.float32)*.55+np.array([255,0,0])*.45).astype(np.uint8)
def digest(a):return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
arrays={'selected':V.astype('<u4'),'low_noise':S.astype('<u4'),'all_blocks':all_blocks,'low_noise_blocks':low,'mask':mask,'distribution':distribution[:,:,::-1],'overlay':rgb}
for name in ['selected','low_noise','all_blocks','low_noise_blocks','mask']:np.save(out/(name+'.npy'),arrays[name])
ref={'width':12000,'height':8000,'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'parameters':[8,50,20000,.25,.5],'arrays':{k:digest(v) for k,v in arrays.items()},'regions':regions,'validCount':len(stats[0]),'selectedCount':len(V),'lowNoiseCount':len(S),'nativeSeconds':time.monotonic()-started};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');print('complete',ref['nativeSeconds'],flush=True)
