#!/usr/bin/env node
// Caller-owned resources only; the adapted model stays in RAM, never on disk.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {adaptSelfDMScopedGraph,SELFDM_SCOPE_MODEL_SHA256,SELFDM_SCOPE_POLICY} from '../src/selfdm-scoped-graph.js';
const [python,pythonDependencies,modelPath,inputPath,referencePath]=process.argv.slice(2);
if(!referencePath)throw Error('Usage: node qualify-selfdm-scientific-scope.mjs PYTHON EXISTING_PYTHON_DEPENDENCIES MODEL INPUT_FLOAT32 REFERENCE_FLOAT32');
const original=new Uint8Array(await readFile(modelPath));
if(createHash('sha256').update(original).digest('hex')!==SELFDM_SCOPE_MODEL_SHA256)throw Error('Pinned SelfDM model identity differs');
const adapted=adaptSelfDMScopedGraph(original),script=String.raw`
import sys,json,hashlib,time
sys.path.insert(0,sys.argv[1])
import onnx,numpy as np,onnxruntime as ort
b=sys.stdin.buffer.read();m=onnx.load_model_from_string(b);onnx.checker.check_model(m,full_check=True)
native=onnx.load(sys.argv[2]);assert len(native.graph.initializer)+11==len(m.graph.initializer)
assert all(a.SerializeToString()==b.SerializeToString() for a,b in zip(native.graph.initializer,m.graph.initializer))
o=ort.SessionOptions();o.intra_op_num_threads=4;o.inter_op_num_threads=1;o.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL;o.enable_cpu_mem_arena=False;o.enable_mem_pattern=False
x=np.fromfile(sys.argv[3],dtype=np.float32).reshape(1,3,512,512);before=hashlib.sha256(x.tobytes()).hexdigest()
reference=np.fromfile(sys.argv[4],dtype=np.float32).reshape(1,1,512,512)
out=np.ones((1,1,512,512),np.float32);indices=np.arange(4096,dtype=np.int64)
session=ort.InferenceSession(b,sess_options=o,providers=['CPUExecutionProvider'])
start=time.perf_counter();actual=session.run(['probability'],{'rgb':x,'scientific_scope_indices':indices,'scientific_scope_output':out})[0];all1ms=(time.perf_counter()-start)*1000
assert np.array_equal(actual,reference),'All-admitted adapted graph must preserve native reference exactly'
all1={'maxAbs':float(np.abs(actual-reference).max()),'maskChanges':int(np.count_nonzero((actual>.5)!=(reference>.5))),'inferenceMs':all1ms}
del session
# Scalar/small witnesses prove the actual runtime uses NxN domains before
# Softmax, correlations and TopK, rather than a filtered4096² result.
from onnx import helper,TensorProto
p='/sherloq/scientific_scope/'
for index in range(3):
 for suffix,input in [('attention-domain-', '/network/satten_'+str(index+3)+'/MatMul_output_0'),('correlation-domain-','/network/Corr'+('_'+str(index) if index else '')+'/MatMul_output_0'),('top-domain-',p+'top-'+str(index))]:
  name=p+suffix+str(index);m.graph.node.append(helper.make_node('Shape',[input],[name]));m.graph.output.append(helper.make_tensor_value_info(name,TensorProto.INT64,[3]))
onnx.checker.check_model(m,full_check=True)
session=ort.InferenceSession(m.SerializeToString(),sess_options=o,providers=['CPUExecutionProvider'])
records=[]
for count in [1,17,48,1024,3072]:
 indices=np.arange(count,dtype=np.int64);coarse=np.zeros(4096,np.float32);coarse[indices]=1;out=np.repeat(np.repeat(coarse.reshape(64,64),8,axis=0),8,axis=1)[None,None]
 start=time.perf_counter();result=session.run(None,{'rgb':x,'scientific_scope_indices':indices,'scientific_scope_output':out});elapsed=(time.perf_counter()-start)*1000;actual=result[0]
 domains=[{'attention':result[1+i*3].tolist(),'correlation':result[2+i*3].tolist(),'top':result[3+i*3].tolist()} for i in range(3)]
 assert all(d=={'attention':[1,count,count],'correlation':[1,count,count],'top':[1,48,count]} for d in domains)
 assert np.isfinite(actual).all() and actual[out==0].max()==0
 records.append({'admittedCentres':count,'refusedCentres':4096-count,'inferenceMs':elapsed,'attentionAndCorrelationPairsPerBranch':count*count,'originalPairsPerBranch':4096*4096,'actualGraphDomains':domains,'outputFinite':True,'excludedOutputMaximum':float(actual[out==0].max()),'paddingCandidates':48,'rank':48})
assert before==hashlib.sha256(x.tobytes()).hexdigest(),'Native source tensor changed'
print(json.dumps({'schema':1,'policy':sys.argv[5],'nativeProvider':'CPUExecutionProvider','onnxruntime':ort.__version__,'originalModelSha256':hashlib.sha256(open(sys.argv[2],'rb').read()).hexdigest(),'adaptedBytes':len(b),'addedBytes':len(b)-len(native.SerializeToString()),'originalInitializersByteIdentical':True,'originalInputSha256':before,'originalInputUntouched':True,'allAdmitted':all1,'partialScopes':records,'cnnContext':'Original convolution neighbourhoods retained; no claim of globally masked CNN context'}))
`;
const child=spawn(python,['-c',script,pythonDependencies,modelPath,inputPath,referencePath,SELFDM_SCOPE_POLICY],{stdio:['pipe','inherit','inherit']});
child.stdin.end(adapted);
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code?reject(Error('Native SelfDM qualification failed: '+code)):resolve());});
