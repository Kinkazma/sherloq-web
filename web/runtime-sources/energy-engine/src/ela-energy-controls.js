import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
// UI request revisions for the callable energy-only engine and its scientific profiles.
// This controller does not run analysis or supply legacy peer biomes.
const DEFAULTS=Object.freeze({histogramLow:10,histogramHigh:990,shadow:50,highlight:50});
const RANGES=Object.freeze({histogramLow:[0,500],histogramHigh:[500,1000],shadow:[0,200],highlight:[0,200]});
function validate(values,complete=true){
 requireValue(values&&typeof values==='object'&&!Array.isArray(values),'Energy values must be an object.');
 const keys=Object.keys(values);requireValue(keys.every(k=>Object.hasOwn(RANGES,k))&&(!complete||keys.length===4),'Four explicit energy values required.');
 for(const key of keys){const [low,high]=RANGES[key];requireValue(Number.isInteger(values[key])&&values[key]>=low&&values[key]<=high,'Invalid '+key);}return {...values};
}
export function createElaEnergyControls(){
 let revision=0,profileId='standard',values={...DEFAULTS},pending=null;
 const snapshot=()=>({revision,profileId,adaptive:profileId==='conservative'||profileId==='sensitive',estimatePending:pending!==null,values:{...values},quantiles:[values.histogramLow/1000,values.histogramHigh/1000],thresholds:[values.shadow/10,values.highlight/10],analysisAvailable:true});
 function manual(){revision++;pending=null;profileId='manual';}
 return {
  snapshot,
  // Claim manual ownership on pointer/key/wheel intent, even at a slider limit.
  beginManualEdit(){manual();return snapshot();},
  edit(patch){const checked=validate(patch,false);manual();values={...values,...checked};return snapshot();},
  selectProfile(id){requireValue(['standard','manual','conservative','sensitive'].includes(id),'Unknown ELA energy profile.');revision++;pending=null;profileId=id;if(id==='standard')values={...DEFAULTS};else if(id==='conservative'||id==='sensitive')pending={revision,profileId:id};return {...snapshot(),estimateRequest:pending?{...pending}:null};},
  applySnapshot(profile){requireValue(profile&&typeof profile.id==='string'&&profile.id.length>0,'Saved profile identity required.');const checked=validate(profile.values);revision++;pending=null;profileId=profile.id;values=checked;return snapshot();},
  acceptAutomatic(answer){if(!pending||answer?.revision!==pending.revision||answer?.profileId!==pending.profileId)return false;const checked=validate(answer.values);values=checked;pending=null;revision++;return true;},
  accepts(answer){return answer?.revision===revision;}
 };
}
