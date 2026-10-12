"""Run the original Apache EfficientLoFTR on exact tensors from UI preparation.

No export copy, RoPE factorization or replacement matching is used in this
reference; safe load of the original author-provided checkpoint is explicit.
"""
import argparse,ast,json,hashlib,sys,types,copy
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--resources-root',type=Path,required=True);parser.add_argument('--diagnose-browser-report',type=Path);parser.add_argument('--large',action='store_true',help='Also qualify the actual native 832-square tensor witness');args=parser.parse_args();root=args.resources_root.resolve()
sys.path.insert(0,str(root/'python-dependencies'));sys.path.insert(0,str(root/'upstream/efficientloftr'))
import torch,numpy as np
from loguru import logger
torch.set_num_threads(2);torch.set_num_interop_threads(1)
original=root/'upstream/efficientloftr/src/utils/misc.py';tree=ast.parse(original.read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='detect_NaN')
misc=types.ModuleType('src.utils.misc');misc.__dict__.update(torch=torch,logger=logger);exec(compile(ast.Module(body=[node],type_ignores=[]),str(original),'exec'),misc.__dict__);sys.modules['src.utils.misc']=misc
from src.loftr import LoFTR,full_default_cfg,reparameter
class IgnoredTrainingMetadata:pass
checkpoint=root/'weights/eloftr_outdoor.ckpt'
if hashlib.sha256(checkpoint.read_bytes()).hexdigest()!='0af6291141c736e75e94b7f8aae4399b77c7731b3f08758212b2cfe370188878':raise RuntimeError('Checkpoint identity mismatch')
with torch.serialization.safe_globals([(IgnoredTrainingMetadata,'pytorch_lightning.callbacks.model_checkpoint.ModelCheckpoint')]):saved=torch.load(checkpoint,map_location='cpu',weights_only=True)
model=LoFTR(copy.deepcopy(full_default_cfg)).eval();model.load_state_dict(saved['state_dict'],strict=True);del saved;model=reparameter(model).eval()
# Independently confirm the trace fixtures against completely unmodified
# upstream code, including matching/border logic, before using their outputs.
original_records=[]
for name in ['overlap-different-shapes','equal-shapes','no-matches','higher-threshold','smaller-shapes']:
 case=np.load(root/'export'/(name+'.npz'));model.coarse_matching.thr=torch.tensor(float(case['threshold']));data={key:torch.from_numpy(case[key].copy()) for key in ['image0','image1']}
 with torch.inference_mode():model(data)
 differences={}
 for out,key in [('keypoints0','mkpts0_f'),('keypoints1','mkpts1_f'),('confidence','mconf')]:
  actual=data[key].detach().numpy();expected=case[out]
  if not np.array_equal(actual,expected):raise RuntimeError('Unmodified native fixture disagreement: '+name+'/'+out)
  differences[out]=0
 original_records.append({'case':name,'matches':len(data['mconf']),'maximumAbsolute':differences,'unmodifiedUpstream':True})
(root/'export/original-native-reference-parity.json').write_text(json.dumps(original_records,indent=2)+'\n')
print(json.dumps({'originalNativeFixturesExact':len(original_records)}),flush=True)
reference_dir=root/'export/engine-reference';reference=json.loads((reference_dir/'prepared-inputs.json').read_text())
for record in reference['records']:
 inputs={}
 for key,spec in record['inputs'].items():
  raw=(reference_dir/spec['file']).read_bytes()
  if len(raw)!=spec['bytes'] or hashlib.sha256(raw).hexdigest()!=spec['sha256']:raise RuntimeError('Input identity '+key)
  inputs[key]=torch.from_numpy(np.frombuffer(raw,dtype='<f4').copy().reshape(spec['dims']))
 model.coarse_matching.thr=inputs.pop('threshold');data=inputs
 with torch.inference_mode():model(data)
 record['outputs']={}
 for name,key in [('keypoints0','mkpts0_f'),('keypoints1','mkpts1_f'),('confidence','mconf')]:
  array=data[key].detach().numpy().astype('<f4');raw=array.tobytes();file=record['name']+'-'+name+'.f32';(reference_dir/file).write_bytes(raw)
  record['outputs'][name]={'file':file,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'dims':list(array.shape)}
 record['nativeMatches']=len(data['mconf']);print(json.dumps({'case':record['name'],'matches':record['nativeMatches']}),flush=True)
 if not record['nativeMatches']:raise RuntimeError('Qualification transformation has no matches')
reference['sourceCommit']='ffd4a4644064354468eb1f0c7a3e732233cb732f';reference['checkpointSha256']=hashlib.sha256(checkpoint.read_bytes()).hexdigest();reference['qualification']='Original native model on the exact UI-prepared tensor bytes; inverse transform validated separately per pixel'
(reference_dir/'native-reference.json').write_text(json.dumps(reference,indent=2)+'\n')

if args.large:
 directory=root/'export/browser-reference';spec=json.loads((directory/'large-reference.json').read_text());raw=(directory/spec['file']).read_bytes()
 if len(raw)!=spec['bytes'] or hashlib.sha256(raw).hexdigest()!=spec['sha256']:raise RuntimeError('Large input identity')
 image=torch.from_numpy(np.frombuffer(raw,dtype='<f4').copy().reshape(spec['dims']));model.coarse_matching.thr=torch.tensor(.2);data={'image0':image,'image1':image}
 with torch.inference_mode():model(data)
 outputs={}
 for name,key in [('keypoints0','mkpts0_f'),('keypoints1','mkpts1_f'),('confidence','mconf')]:
  array=data[key].detach().numpy().astype('<f4');raw=array.tobytes();file='dense-832-'+name+'.f32';(directory/file).write_bytes(raw)
  outputs[name]={'file':file,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'dims':list(array.shape)}
 (directory/'large-native-reference.json').write_text(json.dumps({'outputs':outputs,'nativeMatches':len(data['mconf']),'sourceCommit':'ffd4a4644064354468eb1f0c7a3e732233cb732f','scope':'Original native full model on actual 832 square input, no identity shortcut'},indent=2)+'\n')
 print(json.dumps({'largeNativeMatches':len(data['mconf'])}),flush=True)

if args.diagnose_browser_report:
 report=json.loads(args.diagnose_browser_report.read_text());diagnostics=[]
 for browser_case in report['records']:
  disagreements=[d for d in browser_case.get('disagreements',[]) if d['key']=='keypoints0']
  if not disagreements:continue
  native_case=np.load(root/'export'/(browser_case['name']+'.npz'))
  model.coarse_matching.thr=torch.tensor(float(native_case['threshold']));model.fine_matching.validate=True
  coarse={}
  handle=model.fine_matching.register_forward_pre_hook(lambda module,arguments:coarse.update(points=arguments[2]['mkpts0_c'].clone()))
  data={key:torch.from_numpy(native_case[key].copy()) for key in ['image0','image1']}
  with torch.inference_mode():model(data)
  handle.remove()
  for row in sorted({d['index']//2 for d in disagreements}):
   values,indices=torch.topk(data['conf_matrix_f'][row].reshape(-1),5)
   candidates=[]
   for value,index in zip(values.tolist(),indices.tolist()):
    source_index=index//64;target_index=index%64
    candidates.append({'score':value,'flatIndex':index,'sourcePoint':[float(coarse['points'][row,0])+source_index%8-3.5,float(coarse['points'][row,1])+source_index//8-3.5],'sourceIndex':source_index,'targetIndex':target_index})
   diagnostics.append({'case':browser_case['name'],'row':row,'nativeConfidenceMargin':float(values[0]-values[1]),'relativeMargin':float((values[0]-values[1])/values[0]),'nativeTopCandidates':candidates,'browserDisagreements':[d for d in disagreements if d['index']//2==row]})
 (reference_dir/'native-fine-tie-diagnostic.json').write_text(json.dumps(diagnostics,indent=2)+'\n');print(json.dumps({'fineTieDiagnostics':diagnostics}),flush=True)
