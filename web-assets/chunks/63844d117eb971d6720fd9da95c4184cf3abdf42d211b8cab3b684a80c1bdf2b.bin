import "../../runtime-context.js?v=0.30.0";
import{createNeuralCloneWindowRun}from'./clone-neural-window-runner.js';
import{requireValue,checkAbort}from'./errors.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const surfaceIds=result=>new Set([result.surface,...['rgbSurfaces','planeSurfaces','maskSurfaces','flagSurfaces','tables'].flatMap(key=>Object.values(result[key]??{}))].flatMap(value=>typeof value?.id==='string'?[value.id]:[]));
/** One canonical carrier. Native independent jobs and the explicitly qualified
 * global union retain their complete results. Only managed output handles and
 * presentation origins are combined; no scientific arithmetic is introduced. */
export function createSegmentationIndependentRun({domain,task,original},{native,budget,signal,releaseSurface,admitIndependent=()=>true,admitGlobal,runGlobal,prepareWindows}={}){
 requireValue(native&&typeof native.run==='function'&&typeof releaseSurface==='function','Native window executor and acknowledged managed-surface release required');
 const outputOwners=new Set();let completed=false;
 async function managed(makeRequest,{onOwner,signal},validate){
  let request,result,ids=new Set(),closing,closed=false,nativeReleased=false;
  const owner={dispose(){if(closing)return closing;if(closed)return Promise.resolve();closing=Promise.resolve().then(async()=>{await request?.catch(()=>{});await retireCompositeOwners([...ids].map(id=>async()=>{try{await releaseSurface(id);}catch(error){if(error?.code!=='NOT_FOUND')throw error;}ids.delete(id);}));if(!nativeReleased){await result?.release?.();nativeReleased=true;}closed=true;}).finally(()=>closing=undefined);return closing;}};
  owner.transfer=()=>{requireValue(completed&&result,'Only completed managed outputs may transfer');ids.clear();};outputOwners.add(owner);onOwner(owner);
  request=Promise.resolve().then(makeRequest).then(value=>{result=value;ids=surfaceIds(value);return value;});result=await request;validate(result);checkAbort(signal);return{...result,release:()=>owner.dispose()};
 }
 const checkedGlobal=typeof runGlobal==='function'?args=>managed(()=>runGlobal(args),args,result=>requireValue(result?.cloneWindowMode==='global'&&result.provenance?.cloneWindowMode==='global','Global native result must report the actual qualified mode')):undefined;
 const holder=createNeuralCloneWindowRun({domain,task},{budget,signal,prepareWindows,admitIndependent,admitGlobal,runGlobal:checkedGlobal,
  runWindow(args){return managed(()=>native.run({task:args.task,original,window:args.window,mode:'independent'},{signal:args.signal}),args,result=>requireValue(result.cloneWindowMode==='independent'&&result.provenance?.cloneWindowMode==='independent'&&result.analysisWindow?.fingerprint===args.window.fingerprint,'Native result must report its actual independent window'));}
 });
 const withoutRelease=({release,...data})=>data;
 return{get state(){return holder.state;},async execute(){
  const answer=await holder.execute(),mode=answer.mode,windows=answer.windowResults.map(record=>({...record,status:record.output?.status==='insufficient-support'?'insufficient-support':record.status,output:record.output?withoutRelease(record.output):null})),globalResult=answer.globalResult?withoutRelease(answer.globalResult):null;
  const outputs=mode==='global'&&globalResult?[{id:globalResult.analysisWindow?.id??'global-analysis',kind:'global',bounds:globalResult.analysisWindow?.bounds,origin:globalResult.sourceRegionOrigin??[0,0],status:globalResult.status==='insufficient-support'?'insufficient-support':'complete',output:globalResult}]:windows;
  const insufficient=outputs.filter(w=>w.status==='insufficient-support'),availability=insufficient.map(w=>({id:w.id,kind:w.kind,reason:'native-topk-support-required',...w.output.data.metadata.nativeSupport})),hasComplete=outputs.some(w=>w.status==='complete');
  completed=true;return{id:task.id,imageId:task.imageId,operation:task.operation,cloneWindowMode:mode,status:answer.status==='empty'||windows.every(w=>w.status==='empty')&&!globalResult?'no-regions':insufficient.length?(hasComplete?'partial':'insufficient-support'):'ok',...(insufficient.length?{notice:{code:'NATIVE_SUPPORT_INSUFFICIENT',windows:availability}}:{}),windowResults:windows,...(mode==='global'?{globalResult}:{}),data:{analyses:outputs.map(w=>({id:w.id,kind:w.kind,...(w.bounds?{bounds:[...w.bounds]}:{}),status:w.status,analysisId:w.output?.data?.metadata?.analysisId??null}))},layers:outputs.flatMap(w=>(w.output?.layers??[]).map(layer=>({...layer,id:w.id+':'+layer.id,analysisWindowId:w.id,origin:(layer.origin??[0,0]).map((n,i)=>n+(w.output.sourceRegionOrigin??w.origin)[i])}))),provenance:{...(insufficient.length?{analysisAvailability:availability}:{}),cloneWindowMode:mode,cloneWindowFingerprint:answer.fingerprint,qualificationScope:answer.qualificationScope,params:structuredClone(task.params),windows:windows.map(w=>({id:w.id,kind:w.kind,bounds:[...w.bounds],fingerprint:w.fingerprint,status:w.status,backend:w.output?.provenance?.backend??'not-executed'})),...(globalResult?{global:{analysisId:globalResult.data?.metadata?.analysisId??null,backend:globalResult.provenance?.backend??'not-executed',analysisWindow:globalResult.analysisWindow}}:{})},metrics:{inferences:outputs.reduce((n,w)=>n+(w.output?.metrics?.inferences??0),0)}};
 },async transferOutputs(){requireValue(completed,'A completed managed output is required for registry transfer');for(const owner of outputOwners)owner.transfer();await holder.dispose();},dispose:()=>holder.dispose()};
}
