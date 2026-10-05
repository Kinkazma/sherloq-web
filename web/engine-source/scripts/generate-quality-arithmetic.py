"""Generate private boundary vectors and native predictions; never export weights.

Use after export-quality-model.py. Split-derived vectors remain in .build and
are excluded from delivery; only aggregate validation is public. No training.
"""
from pathlib import Path
import argparse,json,hashlib
import numpy as np,xgboost as xgb
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--model',type=Path,default=ROOT/'.build/quality-model/quality.json');parser.add_argument('--output',type=Path,default=ROOT/'.build/quality-arithmetic');args=parser.parse_args()
assert xgb.__version__=='2.0.3'
model_sha=hashlib.sha256(args.model.read_bytes()).hexdigest();assert model_sha=='bc0c961a9ac7bf0fbabb0316eb5cb34665d7987b678fb8b64b487f10908f04f2'
model=xgb.Booster({'nthread':2});model.load_model(args.model);model.set_param({'nthread':2})
reference=json.loads((ROOT/'fixtures/quality-reference.json').read_text());initial=[c['curve'] for c in reference['cases']];initial.extend([np.zeros(100),np.ones(100)*.5,np.ones(100),np.linspace(0,1,100),np.linspace(1,0,100)])
rng=np.random.default_rng(230001);random=rng.uniform(0,1,(512,100));trees=json.loads(args.model.read_text())['learner']['gradient_booster']['model']['trees']
for i in range(len(random)):
 tree=trees[i%len(trees)];feature=tree['split_indices'][0];value=np.float32(tree['split_conditions'][0]);random[i,feature]=value if i%3==0 else np.nextafter(value,np.float32(-np.inf if i%2 else np.inf))
 if i%23==0:random[i,(i*7)%100]=np.nan
features=np.concatenate([np.array(initial),random]);native=model.predict(xgb.DMatrix(features));inplace=model.inplace_predict(features);assert np.array_equal(native,inplace)
args.output.mkdir(parents=True,exist_ok=True);features.astype('<f8').tofile(args.output/'features.f64')
record=dict(rows=len(features),imageCurves=len(reference['cases']),features=100,modelSha256=model_sha,scores=[float(x) for x in native],formatted=[f'{x:.1f}' for x in native],xgboost=xgb.__version__,numpy=np.__version__,inplaceMatchesDMatrix=True)
(args.output/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:v for k,v in record.items() if k not in ['scores','formatted']}))
