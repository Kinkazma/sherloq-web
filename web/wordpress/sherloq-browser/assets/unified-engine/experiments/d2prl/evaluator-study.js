import{createEvaluator}from'./evaluator.js';
export async function evaluatorStudy(factory,reference,read){
 const engine=await createEvaluator(factory),records=[];let exercise;
 const compare=(a,b)=>{let different=0,maxAbs=0,nonfinite=0;const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);for(let i=0;i<a.length;i++){different+=x[i]!==y[i];maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));nonfinite+=!Number.isFinite(a[i]);}return{elements:a.length,different,maxAbs,nonfinite};};
 try{
  for(const row of reference.records){
   const input={side:row.side,channels:row.inputs.features.shape[1],candidates:row.candidates,referenceThreads:row.referenceThreads??reference.threads??2};for(const[key,prop]of[['features','features'],['offset_x','offsetX'],['offset_y','offsetY']]){const bytes=await read(row.inputs[key]);input[prop]=key==='features'?new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2):new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);}
   const result=await engine.evaluate(input),outputs={};for(const axis of ['x','y']){const b=await read(row.outputs[axis]);outputs[axis]=compare(result[axis],new Float32Array(b.buffer,b.byteOffset,b.byteLength/4));}
   records.push({name:row.name,side:row.side,candidates:row.candidates,outputs});if(!exercise&&row.side===32&&row.candidates>1)exercise=input;
  }
  if(!exercise)throw Error('Missing lifecycle fixture');const controller=new AbortController();let cancelled=false,admission=false;
  try{await engine.evaluate(exercise,{signal:controller.signal,onProgress:f=>{if(f>0&&f<1)controller.abort();}});}catch(error){if(error.code!=='CANCELLED')throw error;cancelled=true;}
  const refused=new Error('study memory refusal');try{await engine.evaluate(exercise,{account:()=>{throw refused;}});}catch(error){if(error!==refused)throw error;admission=true;}
  const recovered=await engine.evaluate(exercise);if(!recovered.x.every(Number.isFinite)||!cancelled||!admission)throw Error('Lifecycle failure');
  return{schema:1,status:records.every(r=>Object.values(r.outputs).every(v=>!v.different&&!v.nonfinite))?'passed':'rejected',scope:'Generated D2PRL evaluator units only, no weights or complete inference; CPU vector-softmax arithmetic reference',cases:records.length,records,lifecycle:{cancelled,admission,retry:true}};
 }finally{engine.dispose();if(engine.residentBytes!==0)throw Error('Disposed module still retained by wrapper');}
}
