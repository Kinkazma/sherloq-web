"""Offline, split D2PRL model qualification, using verified local weights only.
All generated weights and sample payloads remain in .build. No native file edit.
"""
from pathlib import Path
import sys,json,hashlib,collections,importlib.util,time,argparse
import numpy as np
import torch,onnx
import torch.utils.model_zoo
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import load
assert torch.__version__.split('+')[0]=='2.8.0' and onnx.__version__=='1.19.0'
def denied(*args,**kwargs):raise RuntimeError('Offline conversion prohibits downloads')
torch.hub.download_url_to_file=denied;torch.utils.model_zoo.load_url=denied;torch.set_num_threads(8)
spec=importlib.util.spec_from_file_location('web_d2prl_blocks',root/'experiments/d2prl/model-blocks.py');blocks=importlib.util.module_from_spec(spec);spec.loader.exec_module(blocks)
out=root/'.build/d2prl-model';out.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['reference','features','heads','dlf','heads-exact-dlf'],required=True);parser.add_argument('--no-fold',action='store_true');args=parser.parse_args();stage=args.stage;tag=stage+('-unfolded' if args.no_fold else '')
loaded=load('cpu');model=loaded['model'];sha=lambda b:hashlib.sha256(b).hexdigest()
def save(name,tensor):
 a=tensor.detach().numpy();data=a.tobytes();file=name+'.bin';(out/file).write_bytes(data);return dict(file=file,shape=list(a.shape),dtype=str(a.dtype),bytes=len(data),sha256=sha(data))
def read(entry):return torch.from_numpy(np.fromfile(out/entry['file'],dtype=entry['dtype']).reshape(entry['shape']))
if stage=='reference':
 # Structured RGB source with an exact copy, gradients, fine texture and borders.
 from torchvision import transforms as T
 h,w=389,521;y,x=np.indices((h,w));rng=np.random.default_rng(290052)
 rgb=np.stack([(x*7+y*3)%256,(x//11*37+y//9*23)%256,((x-y)**2)%256],axis=2).astype(np.uint8);rgb^=rng.integers(0,16,rgb.shape,dtype=np.uint8);rgb[230:320,330:450]=rgb[50:140,70:190]
 image=T.Compose([T.ToTensor(),T.Resize((448,448))])(rgb)[None];record=dict(schema=1,scope='One synthetic copied RGB source, native CPU D2PRL model, not parity evidence for browser',torch=torch.__version__,onnx=onnx.__version__,weights=loaded['weights'],input=save('rgb448',image),source=save('source-rgb',torch.from_numpy(rgb)),features=[],patchmatch=[])
 def before(module,args):record['features']=[save('native-feature-'+str(i),v) for i,v in enumerate(args)]
 def after(module,args,result):record['patchmatch']=[save('native-patchmatch-'+str(i),v) for i,v in enumerate(result)]
 handles=[model.patchmatch.register_forward_pre_hook(before),model.patchmatch.register_forward_hook(after)];count=[0]
 def progress(*args):
  count[0]+=1
  if count[0]%10==0:print('Native CNN evaluator',count[0],flush=True)
 handles.append(model.patchmatch.evaluate_CNN.register_forward_hook(progress));start=time.monotonic()
 with torch.random.fork_rng(devices=[]),torch.inference_mode():
  torch.set_rng_state(loaded['rng_state']);raw=model(image)
  record['raw']=[save('native-raw-'+str(i),v) for i,v in enumerate(raw)]
  features=blocks.Descriptors(model).eval()(image);record['descriptorWrapperHalfExact']=[np.array_equal(v.half().numpy().view(np.uint16),read(record['features'][i]).numpy().view(np.uint16)) for i,v in enumerate(features)]
  head=blocks.Heads(model).eval()(image,*[read(e) for e in record['patchmatch']]);record['headWrapperExact']=[np.array_equal(a.numpy().view(np.uint32),b.numpy().view(np.uint32)) for a,b in zip(raw,head)]
  record['descriptors']=[save('native-descriptors-'+str(i),v) for i,v in enumerate(features)]
 for handle in handles:handle.remove()
 assert all(record['descriptorWrapperHalfExact']) and all(record['headWrapperExact']),record
 record['nativeElapsedSeconds']=time.monotonic()-start;(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ['descriptorWrapperHalfExact','headWrapperExact','nativeElapsedSeconds']}),flush=True)
else:
 reference=json.loads((out/'reference.json').read_text());image=read(reference['input']);wrapper=({'features':blocks.Descriptors,'heads':blocks.Heads,'dlf':blocks.DlfStudy,'heads-exact-dlf':blocks.HeadsExactDlf}[stage])(model).eval()
 if stage=='dlf':inputs=tuple(read(e) for e in reference['patchmatch'][4:]);names=['x_cor','y_cor','x_cor2','y_cor2'];outputs=[prefix+str(k)+'_'+branch for prefix in ['error','score'] for k in [7,9,11] for branch in ['zm','cnn']]
 else:inputs=(image,) if stage=='features' else (image,*[read(e) for e in reference['patchmatch']]);names=['rgb'] if stage=='features' else ['rgb','xoff','yoff','xoff2','yoff2','x_cor','y_cor','x_cor2','y_cor2'];outputs=['zm','cnn'] if stage=='features' else ['union','target','source']
 if stage=='heads-exact-dlf':
  dlf=json.loads((out/'dlf-unfolded-model.json').read_text());inputs=(*inputs,*[read(e) for e in dlf['expected'][6:]]);names+=['s7_zm','s7_cnn','s9_zm','s9_cnn','s11_zm','s11_cnn']
 target=out/(tag+'.onnx')
 with torch.inference_mode():torch.onnx.export(wrapper,inputs,target,input_names=names,output_names=outputs,opset_version=18,dynamo=False,external_data=False,do_constant_folding=not args.no_fold)
 graph=onnx.load(target);onnx.checker.check_model(graph);metadata=dict(schema=1,stage=stage,constantFolding=not args.no_fold,modelFile=target.name,modelBytes=target.stat().st_size,modelSha256=sha(target.read_bytes()),inputs=names,outputs=outputs,operators=dict(collections.Counter(node.op_type for node in graph.graph.node)),wrapperSha256=sha((root/'experiments/d2prl/model-blocks.py').read_bytes()))
 if stage=='dlf':
  with torch.inference_mode():metadata['expected']=[save('native-'+name,v) for name,v in zip(outputs,wrapper(*inputs))]
 (out/(tag+'-model.json')).write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata),flush=True)
