import {genericHeldPreviewKey} from './generic-held-preview-owner.js?v=0.31.0';
// Typed local presentation tickets. Only the declared numeric setting may drift.
const numeric=(value)=>typeof value==='number'&&Number.isFinite(value);
const at=(value,path)=>path.reduce((v,key)=>v?.[key],value);
function key(value,path){const copy=structuredClone(value);let parent=copy;for(const name of path.slice(0,-1))parent=parent[name];delete parent[path.at(-1)];return genericHeldPreviewKey(copy);}
export function createLocalHeldPreviewOwners(){
 let active=null;
 return{reset(){active=null;},own(event,{settings,heldPath,getSettings,isCurrent}){try{
  if(!event?.continuous||!Number.isSafeInteger(event.generation)||event.generation<1||!Number.isSafeInteger(event.gestureEpoch)||event.gestureEpoch<1||!Array.isArray(heldPath)||!heldPath.length||!numeric(at(settings,heldPath)))return null;
  const identity=[event.field,event.generation,event.gestureEpoch].join('/'),strict=key(settings,heldPath);
  if(active?.identity!==identity)active={identity,latest:null};const lease=active,calculated=structuredClone(settings);lease.latest=calculated;
  const current=()=>{try{if(active!==lease||isCurrent()!==true)return false;const latest=getSettings();return numeric(at(latest,heldPath))&&key(latest,heldPath)===strict;}catch{return false;}};
  return{isCurrent:current,calculated,latest:()=>structuredClone(lease.latest),heldPath:[...heldPath],gesture:{field:event.field,generation:event.generation,gestureEpoch:event.gestureEpoch,controlRequestId:event.controlRequestId,lastAdmittedInput:event.lastAdmittedInput}};
 }catch{return null;}}};
}
