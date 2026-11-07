import {completedGenericHeldPreviewFrame,genericHeldPreviewKey,sameGenericHeldPreviewOwner} from './generic-held-preview-owner.js?v=0.33.1';

// Admission only: the scheduler owns the single flight, publication order and
// deadline. A ticket may finish while its one numeric held field moves, but its
// live proof must retain the source, domain, basis and all other settings.
const numeric=value=>typeof value==='number'&&Number.isFinite(value);
const same=(a,b)=>genericHeldPreviewKey(a)===genericHeldPreviewKey(b);
function proof(event){return typeof event?.completedPreviewCurrent==='function'&&event.completedPreviewCurrent()===true;}
function sameGesture(a,b){
 return a?.phase==='preview'&&['value','preview'].includes(b?.phase)&&a.operation!=='detail.frequency'&&typeof a.operation==='string'&&a.operation!==''&&a.operation===b.operation&&typeof a.toolId==='string'&&a.toolId!==''&&a.toolId===b.toolId&&typeof a.field==='string'&&a.field!==''&&a.field===b.field&&a.continuous===true&&b.continuous===true&&Number.isSafeInteger(a.generation)&&a.generation>0&&a.generation===b.generation&&Number.isSafeInteger(a.gestureEpoch)&&a.gestureEpoch>0&&a.gestureEpoch===b.gestureEpoch&&a.policy?.final!=='explicit'&&b.policy?.final!=='explicit'&&same(a.policy,b.policy);
}
function latestProof(a,b){
 // Raw value events precede owner capture. The existing ticket's proof already
 // checks live settings; never invent a missing proof for a preview ticket.
 return typeof b.completedPreviewCurrent==='function'?proof(b):b.phase==='value'&&proof(a);
}
function cloneSettings(event){
 const key=event.field?.startsWith('view.')?event.field.slice(5):null;
 if(!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(event.operation)||event.policy?.kind!=='retained'||event.policy.strategy!=='clones'||!key||key.includes('.')||!numeric(event.view?.[key]))return null;
 const view={...event.view},extras={...event.extras};delete view[key];
 if(extras.sparseView){if(Object.hasOwn(extras.sparseView,key)&&!Object.is(extras.sparseView[key],event.view[key]))return null;extras.sparseView={...extras.sparseView};delete extras.sparseView[key];}
 return [event.params,view,extras];
}
function parameterSettings(event){
 const median=event.operation==='various.median'&&event.policy?.strategy==='median',ssg=event.operation==='tampering.copyMove.sparse'&&event.params?.algorithm==='SSG'&&event.policy?.strategy==='ssg-localization';
 const fields=median?['threshold','variance']:ssg?['maskThreshold','minimumArea','ssimRadius','ssimOpening','roiRadius']:[];
 if(event.policy?.kind!=='retained'||!fields.includes(event.field)||!numeric(event.params?.[event.field]))return null;
 const params={...event.params};delete params[event.field];return [params,event.view,event.extras??{}];
}
function d2Settings(event){
 if(event.operation!=='ai.clones.d2prl'||event.policy?.kind!=='retained'||event.policy.strategy!=='d2prl-refilter'||event.field!=='minimum'||!Number.isInteger(event.params?.minimum)||event.params.minimum<0||event.params.minimum>5000)return null;
 const params={...event.params};delete params.minimum;return [params,event.view,event.extras??{}];
}
function genericLatest(a,b){
 if(b.phase!=='value')return b;
 return {...b,phase:'preview',genericHeldPreviewOwner:b.genericHeldPreviewOwner??a.genericHeldPreviewOwner,completedPreviewCurrent:()=>latestProof(a,b)};
}
function matchingSettings(read,a,b){const first=read(a),last=read(b);return first!==null&&last!==null&&same(first,last);}
function continuationKind(a,b){
 if(!sameGesture(a,b)||!proof(a)||!latestProof(a,b))return null;
 if(matchingSettings(cloneSettings,a,b))return 'clones';
 if(matchingSettings(parameterSettings,a,b))return 'parameter';
 if(matchingSettings(d2Settings,a,b))return 'd2';
 if(sameGenericHeldPreviewOwner(a,genericLatest(a,b)))return 'generic';
 return null;
}
export function canContinueHeldPreview(event,latest){
 try{return continuationKind(event,latest)!==null&&proof(event)&&latestProof(event,latest);}catch{return false;}
}
export function completedHeldPreviewFrame(event,latest,result){
 try{
  const kind=continuationKind(event,latest);if(!kind||!result||result.operation!==undefined&&result.operation!==event.operation)return false;
  let admitted=false;
  if(kind==='clones')admitted=result.operation===event.operation&&result.exact===true&&result.metrics?.nativePresentation===true&&result.metrics.retainedNativeTables===true&&result.metrics.nativeAnalysisCalls===0&&result.metrics.inferenceCalls===0;
  else if(kind==='parameter'){
   admitted=result.exact===false&&result.provisional===true&&result.approximate===true&&result.exportable===false&&result.metrics?.nativeAnalysisCalls===0&&result.metrics.inferenceCalls===0;
   if(admitted&&event.policy.strategy==='ssg-localization')admitted=numeric(result.params?.[event.field])&&Object.entries(result.params).every(([key,value])=>key===event.field||!Object.hasOwn(event.params,key)||same(value,event.params[key]));
  }else if(kind==='d2')admitted=result.operation==='ai.clones.d2prl'&&result.exact===false&&result.provisional===true&&result.approximate===true&&result.exportable===false&&result.metrics?.inferences===0&&result.metrics.retainedD2Refilter===true&&result.params?.minimum===event.params.minimum&&result.metrics.calculatedMinimum===result.params.minimum;
  if(!admitted)admitted=completedGenericHeldPreviewFrame(event,genericLatest(event,latest),result);
  return admitted&&proof(event)&&latestProof(event,latest);
 }catch{return false;}
}
