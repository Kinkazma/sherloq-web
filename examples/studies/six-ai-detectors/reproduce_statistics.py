"""Recompute the supplied measurements and paired comparisons; no detector inference."""
from pathlib import Path
import argparse,json,math
from collections import Counter
import numpy as np
parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True,help='A new directory for recomputed values')
a=parser.parse_args();ROOT=Path(__file__).resolve().parent;OUT=a.output
OUT.mkdir(parents=True,exist_ok=False)
def dump(name,value):
 (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
records=[json.loads(line)for line in (ROOT/'donnees/predictions.jsonl').read_text().splitlines()]
raw={(r['method'],r['imageId']):r for r in records}
assert len(raw)==len(records)==3996
METHODS = ['b-free', 'spai', 'dda', 'prl', 'community-forensics', 'gapl']
NAMES = ['B-Free', 'SPAI', 'DDA', 'PRL', 'Community Forensics 384', 'GAPL']
VIEWS = ['H', 'H6', 'M', 'M6', 'R', 'R6', 'T', 'T6']
VIEW_NAMES = {'H':'Photos humaines originales','H6':'Photos humaines originales bruitées',
 'M':'Photos humaines réduites','M6':'Photos humaines réduites bruitées',
 'R':'Reconstructions IA','R6':'Reconstructions IA bruitées',
 'T':'Générations textuelles IA','T6':'Générations textuelles IA bruitées'}
SCENARIOS = [('H','R'),('H6','R6'),('M','R'),('M6','R6'),('H','T'),('H6','T6'),('M','T'),('M6','T6')]

def samples(m,v):return sorted([x for (mm,_),x in raw.items() if mm==m and x['view']==v],key=lambda x:x['familyId'])
def auc(y,s):
 pos=s[y==1];neg=s[y==0]
 return float(((pos[:,None]>neg).sum()+.5*(pos[:,None]==neg).sum())/(len(pos)*len(neg)))
def ap(y,s):
 order=np.argsort(-s,kind='stable');yy=y[order];ss=s[order]
 ends=np.r_[np.nonzero(np.diff(ss))[0],len(ss)-1]
 tp=np.cumsum(yy)[ends];recall=tp/y.sum();precision=tp/(ends+1)
 return float(np.sum(np.diff(np.r_[0,recall])*precision))
def scenario(m,n,p):
 a=samples(m,n)+samples(m,p);y=np.array([x['label'] for x in a]);z=np.array([x['decision'] for x in a]);s=np.array([x['score'] for x in a])
 tp=int(((y==1)&(z==1)).sum());fp=int(((y==0)&(z==1)).sum());tn=int(((y==0)&(z==0)).sum());fn=int(((y==1)&(z==0)).sum())
 return {'method':m,'negative':n,'positive':p,'counts':{'TP':tp,'FP':fp,'TN':tn,'FN':fn},'n':len(a),
  'metrics':{'recall':tp/(tp+fn),'falsePositiveRate':fp/(fp+tn),'precision':tp/(tp+fp) if tp+fp else None,
   'accuracy':(tp+tn)/len(a),'f1':2*tp/(2*tp+fp+fn),'balancedAccuracy':.5*(tp/(tp+fn)+tn/(tn+fp)),
   'rocAuc':auc(y,s),'averagePrecision':ap(y,s),'setIoU':tp/(tp+fp+fn)}}
scenarios=[scenario(m,n,p) for m in METHODS for n,p in SCENARIOS]
views=[{'method':m,'view':v,'n':len(a),'positiveDecisions':sum(x['decision'] for x in a),
 'rate':sum(x['decision'] for x in a)/len(a),'mean':float(np.mean([x['score'] for x in a])),
 'median':float(np.median([x['score'] for x in a]))} for m in METHODS for v in VIEWS for a in [samples(m,v)]]

rng=np.random.default_rng(20261105)
switches=[]
contrasts=[('H','M'),('H6','M6'),('H','H6'),('M','M6'),('R','R6'),('T','T6')]
for m in METHODS:
 for av,bv in contrasts:
  a,b=samples(m,av),samples(m,bv);assert [x['familyId'] for x in a]==[x['familyId'] for x in b]
  za=np.array([x['decision'] for x in a]);zb=np.array([x['decision'] for x in b]);delta=zb-za
  gain=int((delta>0).sum());loss=int((delta<0).sum());disc=gain+loss
  p=min(1.,2*sum(math.comb(disc,k) for k in range(min(gain,loss)+1))/2**disc) if disc else 1.
  draws=rng.integers(0,len(a),size=(5000,len(a)));lo,hi=np.quantile(delta[draws].mean(axis=1),[.025,.975])
  switches.append({'method':m,'from':av,'to':bv,'n':len(a),'gainedSignals':gain,'lostSignals':loss,'changed':disc,
   'rateBefore':float(za.mean()),'rateAfter':float(zb.mean()),'delta':float(delta.mean()),'interval':[float(lo),float(hi)],'exactP':p})
ps=sorted(enumerate(switches),key=lambda pair:pair[1]['exactP']);maximum=0.
for rank,(i,x) in enumerate(ps):
 maximum=max(maximum,min(1.,(len(ps)-rank)*x['exactP']));switches[i]['holmP']=maximum
pairs=[]
for m in METHODS:
 for n,p in [('H','R'),('H6','R6'),('M','R'),('M6','R6')]:
  a,b=samples(m,n),samples(m,p);assert [x['familyId'] for x in a]==[x['familyId'] for x in b]
  cells=Counter(str(x['decision'])+str(y['decision']) for x,y in zip(a,b))
  pairs.append({'method':m,'negative':n,'positive':p,'n':len(a),'cells':dict(cells),
    'bothCorrect':cells['01']/len(a),'scoreOrder':sum(y['score']>x['score'] for x,y in zip(a,b))/len(a)})
common=[]
for i,m in enumerate(METHODS):
 for mm in METHODS[i+1:]:
  for v in VIEWS:
   a,b=samples(m,v),samples(mm,v);assert [x['imageId'] for x in a]==[x['imageId'] for x in b]
   both=sum(x['decision']!=x['label'] and y['decision']!=y['label'] for x,y in zip(a,b))
   only_a=sum(x['decision']!=x['label'] and y['decision']==y['label'] for x,y in zip(a,b))
   only_b=sum(x['decision']==x['label'] and y['decision']!=y['label'] for x,y in zip(a,b))
   common.append({'methodA':m,'methodB':mm,'view':v,'n':len(a),'bothWrong':both,'onlyAWrong':only_a,'onlyBWrong':only_b,'bothCorrect':len(a)-both-only_a-only_b})


result={'methods':METHODS,'methodNames':NAMES,'views':views,'scenarios':scenarios,'transitions':switches,'paired':pairs,'commonErrors':common}
expected=json.loads((ROOT/'donnees/resultats-recalcules.json').read_text())
def compare(a,b,path=''):
 if isinstance(a,dict):
  assert set(a)==set(b),path
  for k in a:compare(a[k],b[k],path+'/'+k)
 elif isinstance(a,list):
  assert len(a)==len(b),path
  for i,(x,y)in enumerate(zip(a,b)):compare(x,y,path+'/'+str(i))
 elif isinstance(a,(int,float))and not isinstance(a,bool):assert abs(a-b)<1e-12,(path,a,b)
 else:assert a==b,(path,a,b)
compare(result,expected)
dump('resultats-recalcules.json',result)
print(json.dumps({'predictions':len(raw),'referenceComparison':'passed','newInference':False}))
