#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {adaptSelfDMProposalCRFScopedGraph,SELFDM_PROPOSAL_CRF_SHA256,SELFDM_PROPOSAL_CRF_SCOPE_POLICY} from '../src/selfdm-proposal-crf-scoped-graph.js';
const [python,deps,modelPath,fixtures]=process.argv.slice(2);
if(!fixtures)throw Error('Usage: node qualify-selfdm-proposal-crf-scope.mjs PYTHON EXISTING_DEPS PINNED_MODEL EXISTING_FIXTURE_DIRECTORY');
const original=new Uint8Array(await readFile(modelPath));if(createHash('sha256').update(original).digest('hex')!==SELFDM_PROPOSAL_CRF_SHA256)throw Error('Pinned CRF identity differs');
const adapted=adaptSelfDMProposalCRFScopedGraph(original),script=String.raw`
import sys,json,hashlib
sys.path.insert(0,sys.argv[1])
import onnx,onnxruntime as ort,numpy as np
b=sys.stdin.buffer.read();m=onnx.load_model_from_string(b);onnx.checker.check_model(m,full_check=True)
native=onnx.load(sys.argv[2]);assert len(m.graph.initializer)==len(native.graph.initializer)+4
assert all(a.SerializeToString()==b.SerializeToString() for a,b in zip(native.graph.initializer,m.graph.initializer))
o=ort.SessionOptions();o.log_severity_level=3;o.intra_op_num_threads=4;o.inter_op_num_threads=1;o.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL;o.enable_cpu_mem_arena=False;o.enable_mem_pattern=False
baseline=ort.InferenceSession(sys.argv[2],sess_options=o,providers=['CPUExecutionProvider']);scoped=ort.InferenceSession(b,sess_options=o,providers=['CPUExecutionProvider']);records=[]
for width,height in [(32,32),(47,33)]:
 stem=sys.argv[3]+'/'+str(width)+'x'+str(height)
 unary=np.fromfile(stem+'-unary.bin',np.float32).reshape(1,2,height,width);image=np.fromfile(stem+'-image.bin',np.float32).reshape(1,3,height,width);u0=hashlib.sha256(unary.tobytes()).hexdigest();rgb0=hashlib.sha256(image.tobytes()).hexdigest()
 feeds={'unary':unary,'image':image,'origin':np.zeros(2,np.float32)};reference=baseline.run(None,feeds)[0]
 coarse=np.ones((1,1,(height+3)//4,(width+3)//4),np.float32);out=np.ones((1,height,width),np.float32)
 actual=scoped.run(None,{**feeds,'scientific_scope_coarse':coarse,'scientific_scope_output':out})[0]
 assert actual.tobytes()==reference.tobytes(),'All-admitted CRF must preserve the pinned ORT result byte for byte'
 # Zero all coarse cells whose pooled support touches the altered source block.
 p0=((4-height%4)%4+1)//2;p1=((4-width%4)%4+1)//2
 for y in range(coarse.shape[2]):
  for x in range(coarse.shape[3]):
   x0=max(0,x*4-p1);y0=max(0,y*4-p0);x1=min(width,(x+1)*4-p1);y1=min(height,(y+1)*4-p0)
   if x0<24 and x1>8 and y0<24 and y1>8:coarse[:,:,y,x]=0
 out[:,8:24,8:24]=0
 first=scoped.run(None,{**feeds,'scientific_scope_coarse':coarse,'scientific_scope_output':out})[0]
 changed=unary.copy();changed[:,0,8:24,8:24]=1000;changed[:,1,8:24,8:24]=-1000
 second=scoped.run(None,{**feeds,'unary':changed,'scientific_scope_coarse':coarse,'scientific_scope_output':out})[0]
 delta=float(np.abs(first[out==1]-second[out==1]).max());assert delta==0,'Excluded unary sources must not propagate into admitted output'
 assert np.isfinite(second).all() and second[out==0].max()==0
 assert u0==hashlib.sha256(unary.tobytes()).hexdigest() and rgb0==hashlib.sha256(image.tobytes()).hexdigest()
 records.append({'width':width,'height':height,'allAdmittedByteIdentical':True,'excludedUnaryPerturbation':2000,'admittedOutputMaxAbsAfterExcludedUnaryChange':delta,'excludedOutputMaximum':float(second[out==0].max()),'outputFinite':True,'sourceImageAndUnaryUntouched':True,'nativePoolingPhase':[p0,p1]})
print(json.dumps({'schema':1,'policy':sys.argv[4],'nativeProvider':'CPUExecutionProvider','onnxruntime':ort.__version__,'adaptedBytes':len(b),'addedBytes':len(b)-len(native.SerializeToString()),'originalInitializersByteIdentical':True,'records':records,'appearanceContext':'Original RGB retained; source/target unary propagation restricted before multiplication with messages'}))
`;
const child=spawn(python,['-c',script,deps,modelPath,fixtures,SELFDM_PROPOSAL_CRF_SCOPE_POLICY],{stdio:['pipe','inherit','inherit']});child.stdin.end(adapted);
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code?reject(Error('Native CRF qualification failed: '+code)):resolve());});
