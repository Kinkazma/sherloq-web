import {requireValue} from './unified-engine/src/errors.js';

const modes=new Set(['whole','selected']);
/** Intent is supplied by the actual source owner, never inferred from an empty
 * list. It travels with the editor draft so undo/redo restores the same domain.
 * Only an explicit acquisition edit can change it during that transaction. */
export function copySubimagesSelectionPolicy(policy){
 requireValue(policy&&modes.has(policy.positiveMode)&&modes.has(policy.afterLastAcquisitionDelete),'The editor source owner must provide a valid positive-selection policy.');
 if(policy.implicitWholeId!==undefined)requireValue(typeof policy.implicitWholeId==='string'&&!!policy.implicitWholeId,'Invalid implicit whole-image acquisition identity.');
 return{positiveMode:policy.positiveMode,afterLastAcquisitionDelete:policy.afterLastAcquisitionDelete,...(policy.implicitWholeId?{implicitWholeId:policy.implicitWholeId}:{})};
}
export function initializeSubimagesSelection(draft,policy={positiveMode:'selected',afterLastAcquisitionDelete:'selected'}){
 draft.subimagesSelection=copySubimagesSelectionPolicy(policy);return draft;
}
export function updateSubimagesSelection(draft,previous){
 const policy=previous?.subimagesSelection;requireValue(policy&&modes.has(policy.positiveMode)&&modes.has(policy.afterLastAcquisitionDelete),'The source selection intent was lost by an editor transaction.');
 draft.subimagesSelection={...policy};const old=previous.zones.filter(z=>z.kind==='acquisition'),next=draft.zones.filter(z=>z.kind==='acquisition'),byId=new Map(old.map(z=>[z.id,z]));
 const actionCount=(draft.truncatedActions??0)+draft.actions.length-(previous.truncatedActions??0)-previous.actions.length;
 const touchedImplicit=policy.implicitWholeId&&actionCount>0&&draft.actions.slice(-actionCount).some(action=>action.id===policy.implicitWholeId);
 if(touchedImplicit){delete draft.subimagesSelection.implicitWholeId;draft.subimagesSelection.positiveMode='selected';}
 const changed=next.some(z=>!byId.has(z.id)||JSON.stringify(z.polygon)!==JSON.stringify(byId.get(z.id).polygon));
 if(changed){
  draft.subimagesSelection.positiveMode='selected';
  // The Original owner represents its initial whole domain by this explicit
  // synthetic zone. Adding a real acquisition replaces it in the same undo
  // transaction; it must not silently re-admit the gaps between new regions.
  const implicit=next.find(z=>z.id===draft.subimagesSelection.implicitWholeId),added=next.some(z=>z.id!==policy.implicitWholeId&&!byId.has(z.id));
  if(implicit&&added&&implicit.x0===0&&implicit.y0===0&&implicit.x1===draft.width&&implicit.y1===draft.height&&JSON.stringify(implicit.polygon)===JSON.stringify([[0,0],[draft.width,0],[draft.width,draft.height],[0,draft.height]]))draft.zones=draft.zones.filter(z=>z!==implicit);
 }else if(old.length&&old.some(z=>!next.some(n=>n.id===z.id))&&!next.length)draft.subimagesSelection.positiveMode=policy.afterLastAcquisitionDelete;
 if(!draft.zones.some(z=>z.kind==='acquisition'&&z.id===draft.subimagesSelection.implicitWholeId))delete draft.subimagesSelection.implicitWholeId;
 return draft;
}
export function subimagesSelectionMode(draft){
 const mode=draft?.subimagesSelection?.positiveMode;requireValue(modes.has(mode),'The source owner selection intent is unavailable.');return mode;
}
