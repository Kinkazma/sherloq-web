// Typed completed-frame admission only. This helper owns no scientific values,
// pixels, caches, viewport or storage. Opaque references belong to capture().
export const GENERIC_HELD_PREVIEW_FAMILIES=Object.freeze(['derived-pixel','retained-tables','native-postprocess','ghost-hybrid']);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function genericHeldPreviewKey(value){
 const ancestors=new Set();let nodes=0;
 function encode(v,depth){
  if(++nodes>65536||depth>64)throw Error('Held preview settings exceed their bounded control record.');
  if(v===undefined)return'u';if(v===null)return'n';if(typeof v==='number')return Number.isNaN(v)?'dNaN':v===Infinity?'dInf':v===-Infinity?'d-Inf':Object.is(v,-0)?'d-0':'d'+v;
  if(typeof v==='string')return's'+JSON.stringify(v);if(typeof v==='boolean')return v?'b1':'b0';if(typeof v==='bigint')return'i'+v;
  if(typeof v!=='object'||ancestors.has(v))throw Error('Unsupported or cyclic held preview settings.');ancestors.add(v);let result;
  try{if(Array.isArray(v)){if(v.length>65536)throw Error('Held preview array exceeds its bounded control record.');result='['+Array.from({length:v.length},(_,i)=>own(v,i)?encode(v[i],depth+1):'hole').join(',')+']';}
   else if(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)result='{'+Object.keys(v).sort().map(key=>JSON.stringify(key)+':'+encode(v[key],depth+1)).join(',')+'}';
   else{
    // File/Blob attachments also require exact identities in capture(). Other
    // opaque values have no generic settings contract and fail closed.
    const tag=Object.prototype.toString.call(v),metadata={};if(!['[object File]','[object Blob]'].includes(tag))throw Error('Unsupported opaque held preview setting.');for(const key of ['name','size','type','lastModified'])if(typeof v[key]==='string'||typeof v[key]==='number')metadata[key]=v[key];result='opaque'+tag+encode(metadata,depth+1);
   }
  }finally{ancestors.delete(v);}return result;
 }
 return encode(value,0);
}
function parts(path){const value=typeof path==='string'?path.split('.'):[];return value.length&&value.every(key=>key&&key!=='__proto__'&&key!=='prototype'&&key!=='constructor')?value:null;}
function at(object,path){let value=object;for(const key of path){if(!value||typeof value!=='object'||!own(value,key))return{present:false};value=value[key];}return{present:true,value};}
function remove(object,path){let value=object;for(const key of path.slice(0,-1)){if(!value||typeof value!=='object'||!own(value,key))return;value=value[key];}if(value&&typeof value==='object')delete value[path.at(-1)];}
function heldSettings(event,mirrors=[]){
 const field=parts(event?.field),prefixed=['params','view'].includes(field?.[0]),root=prefixed?field[0]:'params',path=prefixed?field.slice(1):field;
 if(!path?.length||event?.policy?.final==='explicit'||!['retained','pixel-proxy'].includes(event?.policy?.kind))return null;
 const settings={params:event.params,view:event.view,extras:event.extras??{}},held=at(settings[root],path);
 if(!held.present||typeof held.value!=='number'||!Number.isFinite(held.value)||!Array.isArray(mirrors))return null;
 const copy=structuredClone(settings),paths=[];remove(copy[root],path);
 for(const name of mirrors){const mirror=parts(name);if(!mirror||!['params','view','extras'].includes(mirror[0])||mirror.length<2||name===root+'.'+path.join('.')||paths.includes(name))return null;const value=at(settings,mirror);if(value.present&&(typeof value.value!=='number'||!Object.is(value.value,held.value)))return null;if(value.present)remove(copy,mirror);paths.push(name);}
 return{key:genericHeldPreviewKey(copy),fieldPath:root+'.'+path.join('.'),mirrors:paths.sort()};
}
export function createGenericHeldPreviewOwner({getState,capture,mirrors=()=>[]}={}){
 if(typeof getState!=='function'||typeof capture!=='function'||typeof mirrors!=='function')throw Error('Live settings and exact source/basis captures are required.');
 return function ownCompletedGenericPreview(event){
  if(event?.phase!=='preview'||!event.continuous||event.operation==='detail.frequency'||event.policy?.strategy==='d2prl-refilter'||event.policy?.strategy==='ssg-localization')return event;
  try{const paths=mirrors(event),settings=heldSettings(event,paths);if(!settings)return event;const live=heldSettings({...event,...getState(event)},paths);if(!live||live.key!==settings.key||live.fieldPath!==settings.fieldPath)return event;
   const captured=capture(event),current=typeof captured==='function'?captured:captured?.current,previous=event.completedPreviewCurrent;if(typeof current!=='function'||current()!==true)return event;
   return{...event,genericHeldPreviewOwner:Object.freeze({version:1,settingsKey:settings.key,fieldPath:settings.fieldPath,mirrors:Object.freeze([...settings.mirrors])}),completedPreviewCurrent:()=>{try{if(current()!==true||typeof previous==='function'&&previous()!==true)return false;const next=heldSettings({...event,...getState(event)},paths);return next!==null&&next.key===settings.key&&next.fieldPath===settings.fieldPath;}catch{return false;}}};
  }catch{return event;}
 };
}
function familyAllowed(event,result,family){
 const policy=event.policy,op=event.operation,strategy=policy?.strategy;if(policy?.final==='explicit')return false;
 if(family==='derived-pixel')return op!=='detail.frequency'&&op!=='jpeg.ghosts'&&(policy?.kind==='pixel-proxy'||op==='noise.noisesniffer'&&strategy==='noisesniffer-native-cache'&&policy?.fallback==='pixel-proxy');
 if(family==='ghost-hybrid')return op==='jpeg.ghosts'&&['ghosts','ghosts-recompression'].includes(strategy)&&['retained','pixel-proxy'].includes(policy?.kind);
 if(policy?.kind!=='retained')return false;
 if(family==='native-postprocess')return ['safire-grouping','research','noisesniffer-native-cache','zero-native-cache','stereo-native-cache'].includes(strategy);
 if(family==='retained-tables')return ['histogram','pca','contrast','illuminant','resampling','research','clones-classical','median'].includes(strategy)||strategy==='clones'&&['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(op)&&result.exact===false;
 return false;
}
export function sameGenericHeldPreviewOwner(a,b){
 try{const x=a?.genericHeldPreviewOwner,y=b?.genericHeldPreviewOwner;
  if(!a||!b||!x||!y||x.version!==1||y.version!==1)return false;
  const first=heldSettings(a,x.mirrors),last=heldSettings(b,y.mirrors);
  return !!(first&&last&&first.key===x.settingsKey&&last.key===y.settingsKey&&first.fieldPath===x.fieldPath&&last.fieldPath===y.fieldPath&&a.phase==='preview'&&b.phase==='preview'&&a.continuous&&b.continuous&&Number.isSafeInteger(a.generation)&&a.generation>0&&a.generation===b.generation&&Number.isSafeInteger(a.gestureEpoch)&&a.gestureEpoch>0&&a.gestureEpoch===b.gestureEpoch&&a.operation===b.operation&&a.toolId===b.toolId&&a.field===b.field&&genericHeldPreviewKey(a.policy)===genericHeldPreviewKey(b.policy)&&x.settingsKey===y.settingsKey&&x.fieldPath===y.fieldPath&&genericHeldPreviewKey(x.mirrors)===genericHeldPreviewKey(y.mirrors)&&a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true);
 }catch{return false;}
}
export function completedGenericHeldPreviewFrame(event,latest,result){
 try{const a=event,b=latest,tag=result?.heldPreview;
  if(!result||!sameGenericHeldPreviewOwner(a,b)||tag?.version!==1||!GENERIC_HELD_PREVIEW_FAMILIES.includes(tag.family)||tag.operation!==a.operation||result.operation!==undefined&&result.operation!==a.operation||!familyAllowed(a,result,tag.family))return false;
  if(!record(tag.requested)||!record(tag.calculated)||!record(tag.requested.params)||!record(tag.requested.view)||!record(tag.calculated.params)||!record(tag.calculated.view)||genericHeldPreviewKey(tag.requested.params)!==genericHeldPreviewKey(a.params)||genericHeldPreviewKey(tag.requested.view)!==genericHeldPreviewKey(a.view))return false;
  genericHeldPreviewKey(tag.calculated.params);genericHeldPreviewKey(tag.calculated.view);
  const pixels=result.pixels,summary=tag.family==='retained-tables'&&a.policy?.strategy==='histogram'&&record(result.data?.summary);
  if(!summary&&(!pixels||pixels.format!=='rgb8'||!Number.isSafeInteger(pixels.width)||pixels.width<1||pixels.width>2048||!Number.isSafeInteger(pixels.height)||pixels.height<1||pixels.height>2048||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3))return false;
  return a.completedPreviewCurrent?.()===true&&b.completedPreviewCurrent?.()===true;
 }catch{return false;}
}
