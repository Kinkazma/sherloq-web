import {createWorkerEngine} from '../src/worker-client.js';
const assert=(value,message)=>{if(!value)throw Error(message);};
function equal(actual,expected,name){if(name==='regions'){assert(JSON.stringify(actual)===JSON.stringify(expected),'Region metadata');return;}const flat=expected.flat(5).map(Number);assert(actual.length===flat.length,name+' length');for(let i=0;i<flat.length;i++)assert(Math.abs(actual[i]-flat[i])<=(name==='content'?3e-7:0),name+'/'+i);}
export async function elaPipelineBrowserTest(){
 const load=async name=>new Uint8Array(await(await fetch('/tests/data/'+name)).arrayBuffer()),texture=await load('ela-content.png'),ref=await(await fetch('/tests/data/ela-describe-native.json')).json(),group=ref.groups.find(g=>g.source==='image-1.rgb'&&g.block===16),engine=createWorkerEngine({resourceHints:{hardwareConcurrency:2}}),params={block:16,ghost:false,background:true};
 try{
  await engine.load({id:'i',bytes:texture});const result=await engine.run({id:'r',imageId:'i',operation:'ela.biomes',params});
  for(const key of ['quality_scores','signed_scores','peer_count','coherent_score'])equal(result.data[key],group[key],key);
  for(const key of Object.keys(group.background))equal(result.data[key],group.background[key],key);
  assert(result.metrics.workers===2,'Two useful cell workers');assert(result.metrics.cellScheduling.preflightExecutions===0,'No preflight');
  const changed=await engine.run({id:'t',imageId:'i',operation:'ela.biomes',params:{...params,threshold:1,minimum:1}});assert(changed.metrics.cellRecompressions===0,'Threshold cache');
  const shifted=await engine.run({id:'q',imageId:'i',operation:'ela.biomes',params:{...params,quality:80}});assert(shifted.metrics.cellRecompressions===1,'One additional quality probe');
  await engine.unload('i');const smallRef=await(await fetch('/tests/data/ela-pipeline-native.json')).json(),small=await load(smallRef.file),item=smallRef.cases[2];await engine.load({id:'i',bytes:small});const ghost=await engine.run({id:'g',imageId:'i',operation:'ela.biomes',params:item.params});for(const [name,value]of Object.entries(item.data))equal(ghost.data[name],value,name);
  const exported=await engine.exportResult(ghost,{format:'npz'});assert(exported.bytes.length>0,'NPZ');
  await engine.unload('i');await engine.load({id:'i',bytes:texture});const abort=new AbortController();let stopped=false;
  try{await engine.run({id:'stop',imageId:'i',operation:'ela.biomes',params},{signal:abort.signal,onProgress:e=>{if(e.phase==='kernel'&&e.fraction>0)abort.abort();}});}catch(e){stopped=e.code==='CANCELLED'&&e.imagesCleared;}assert(stopped,'Hard worker abort');
  await engine.load({id:'i',bytes:texture});const recovered=await engine.run({id:'recover',imageId:'i',operation:'ela.biomes',params});equal(recovered.data.signed_scores,group.signed_scores,'recovery');
  return {status:'passed',workers:result.metrics.workers,preflightExecutions:0,thresholdRecompressions:changed.metrics.cellRecompressions,shiftedQualityRecompressions:shifted.metrics.cellRecompressions,ghostPhases:ghost.metrics.ghostPhasesComputed,npzBytes:exported.bytes.length,cancellation:'hard abort, reload, exact recovery'};
 }finally{engine.dispose();}
}
