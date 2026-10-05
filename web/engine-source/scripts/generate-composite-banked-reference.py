from pathlib import Path
import sys,json
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source/gui'))
from noiseprint.utility.gaussianMixture import gm
out=root/'.build/composite-banked';out.mkdir(exist_ok=True);cases=[]
for directory in ['composite','composite-small-singular']:
 base=root/'.build'/directory;reference=json.loads((base/'reference.json').read_text())
 def read(name):
  f=reference['files'][name];return np.fromfile(base/f['file'],dtype=f['dtype']).reshape(f['shape'])
 spam,L,valid=read('spam'),read('L'),read('valid');projected=spam.reshape(-1,512)@L;training=projected[valid.ravel().astype(bool)];models=[];random=np.random.RandomState(0)
 for i in range(10):
  m=gm(512,[0],[2],outliersProb=.01,outliersNlogl=42,dtype=training.dtype);m.setRandomParams(training,regularizer=-1.,randomState=random);score,flag,iteration=m.EM(training,maxIter=100,regularizer=-1.);models.append((m,score,flag,iteration))
 best=0
 for i in range(1,10):
  if models[i][1]>models[best][1]:best=i
 model=models[best][0];_,mahal=model.getNlogl(projected);files={}
 for name,v in [('training',training),('projected',projected),('Sigma',model.listSigma[0]),('mu',model.mu),('outliersProb',np.asarray(model.outliersProb)),('prioriProb',model.prioriProb),('map',mahal.ravel())]:
  p=out/(directory+'-'+name+'.f64');v.astype('<f8').tofile(p);files[name]={'file':p.name,'dims':list(v.shape)}
 cases.append({'id':directory,'bestReplicate':best,'replicates':[{'score':s,'exit':[flag,it]} for m,s,flag,it in models],'files':files})
 print(directory,len(training),best,flush=True)
(out/'reference.json').write_text(json.dumps({'cases':cases},indent=2)+'\n')
