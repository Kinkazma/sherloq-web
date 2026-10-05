from pathlib import Path
import json,math
root=Path(__file__).resolve().parents[1];p=root/'docs/comparison-96mp-proof.json';proof=json.loads(p.read_text());result=proof['result'];ref=json.loads((root/'.build/comparison-96mp/reference.json').read_text());assert [v['sha256'] for v in result['sources']]==ref['sourceSha256'];errors={}
for case in result['cases']:
 assert not case['errors'];view=case['params']['view'];assert case['sha256']==ref['views'][view],view;case['allPixelsNativeExact']=True
 for name,value in case['values'].items():
  native=ref['values'][name]
  if isinstance(native,str):assert native==value;continue
  error=abs(native-value);assert error<=1e-8*max(1,abs(native)),(name,native,value,error);errors[name]=max(error,errors.get(name,0))
assert len(result['cases'][0]['values'])==20
result['nativeComparison']={'absoluteErrors':errors,'allCompleteRgbHashesExact':True,'nativeSeconds':ref['nativeSeconds'],'reference':'actual native ComparisonEngine; retained helpers with development-only extended timeout'};p.write_text(json.dumps(proof,indent=2)+'\n');print(errors)
