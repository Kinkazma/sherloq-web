"""Export only the pinned historical local SHERLOQ quality checkpoint to JSON.

The browser accepts JSON and never runs pickle. This offline converter refuses
any other source bytes before calling the native wrapper. No training/download.
Keep generated model files outside source/runtime delivery manifests.
"""
from pathlib import Path
import argparse,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
SOURCE_SHA='4b3a90e3b22ec4436b4a4e2bee7abd5055e7c541d2d3ae9b541dc890656424d4'
def export_model(source,destination):
 if hashlib.sha256(source.read_bytes()).hexdigest()!=SOURCE_SHA:raise ValueError('Unsupported source checkpoint: SHA256 does not match the verified historical file.')
 if destination.exists():raise FileExistsError('Refusing to overwrite an existing model export.')
 import joblib,xgboost
 if xgboost.__version__!='2.0.3':raise ValueError('Use the pinned XGBoost2.0.3 native environment for this conversion.')
 booster=joblib.load(source).get_booster()
 if booster.num_features()!=100:raise ValueError('Expected100 model inputs.')
 destination.parent.mkdir(parents=True,exist_ok=True);booster.save_model(destination)
 return dict(sourceSha256=SOURCE_SHA,jsonSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),jsonBytes=destination.stat().st_size,xgboost=xgboost.__version__,trained=False,weightsBundled=False)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,default=ROOT.parent/'source/gui/models/jpeg_qf.mdl');parser.add_argument('--output',type=Path,default=ROOT/'.build/quality-model/quality.json');args=parser.parse_args();print(json.dumps(export_model(args.source,args.output)))
