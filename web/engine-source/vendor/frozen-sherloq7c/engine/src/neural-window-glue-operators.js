import {XFEAT_GLUE_GLOBAL_ASSETS} from './xfeat-glue-global-assets.js';
import {requireValue} from './errors.js';

const signatures=Object.freeze({
 attention:{inputs:['q','k','v','valid'],output:'context'},
 'log-assignment':{inputs:['q','k','valid'],output:'logProbability'},
 dot:{inputs:['q','k'],output:'logits'},
 value:{inputs:['weights','v'],output:'context'}
});
export function neuralWindowGlueOperator(name){
 const signature=signatures[name],asset=XFEAT_GLUE_GLOBAL_ASSETS[name];
 requireValue(signature&&asset,'Only the original pinned GPU Glue operators are admitted.');
 return{...signature,asset};
}
export function neuralWindowGlueOutputs(name,inputs){
 const {inputs:names,output}=neuralWindowGlueOperator(name);
 requireValue(inputs&&Object.keys(inputs).length===names.length&&names.every(k=>inputs[k]),'Complete original Glue operator inputs required.');
 for(const [key,t]of Object.entries(inputs)){
  const Type=key==='valid'?Uint8Array:Float32Array;
  requireValue(t.type===(key==='valid'?'bool':'float32')&&t.data instanceof Type&&Array.isArray(t.dims)&&t.dims.length<=3&&t.dims.every(n=>Number.isSafeInteger(n)&&n>0)&&t.data.length===t.dims.reduce((a,b)=>a*b,1),'Original Glue tensor shape/type differs.');
 }
 let dims;
 if(name==='value'){
  const w=inputs.weights.dims,v=inputs.v.dims;requireValue(w.length===3&&v.length===3&&w[0]===v[0]&&w[2]===v[1],'Glue value dimensions differ.');dims=[w[0],w[1],v[2]];
 }else{
  const q=inputs.q.dims,k=inputs.k.dims;
  if(name==='log-assignment'){requireValue(q.length===2&&k.length===2&&q[1]===k[1],'Glue assignment dimensions differ.');dims=[q[0],k[0]];}
  else{requireValue(q.length===3&&k.length===3&&q[0]===k[0]&&q[2]===k[2],'Glue cross dimensions differ.');dims=name==='dot'?[q[0],q[1],k[1]]:[q[0],q[1],q[2]];}
  if(inputs.valid){const v=inputs.valid.dims;requireValue(v.length===2&&v[0]===q[q.length-2]&&v[1]===k[k.length-2],'Glue complete observation mask differs.');}
  if(inputs.v){const v=inputs.v.dims;requireValue(v.length===3&&v.every((n,i)=>n===k[i]),'Glue value bank differs.');}
 }
 return[{name:output,type:'float32',upper:dims}];
}
