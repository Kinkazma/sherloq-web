import {copySubimagesSelectionPolicy} from './subimages-selection-intent.js?v=0.30.0';
import {requireValue} from './unified-engine/src/errors.js';

// Only the UI owner calls this when it creates its initial default scope. An
// explicitly requested manual full-source scope carries no such provenance.
export function markInitialIndividualSourceSelection(scope,draft){
 const zones=draft.zones.filter(zone=>zone.kind==='acquisition'),zone=zones[0];
 requireValue(draft.sourceSha256===scope.sourceSha256&&draft.width===scope.width&&draft.height===scope.height&&zones.length===1&&zone.x0===0&&zone.y0===0&&zone.x1===scope.width&&zone.y1===scope.height&&JSON.stringify(zone.polygon)===JSON.stringify([[0,0],[scope.width,0],[scope.width,scope.height],[0,scope.height]]),'The initial individual selection must belong to the actual whole-source draft.');
 return{...scope,individual:{...scope.individual,initialSourceSelection:{sourceSha256:scope.sourceSha256,width:scope.width,height:scope.height,positiveMode:'whole',afterLastAcquisitionDelete:'selected',implicitWholeId:zone.id}}};
}
// The Original owner supplies the intent. A synthetic initial whole-source
// acquisition is replaced when the first real acquisition is added; explicit
// full-image acquisitions and exclusion-only searches keep their meaning.
export function individualSourceSelectionPolicy(scope){
 const selected={positiveMode:'selected',afterLastAcquisitionDelete:'selected'};
 if(scope?.manual?.subimagesSelection!==undefined){
  const manual=scope.manual;
  if(manual.sourceSha256!==scope.sourceSha256||manual.width!==scope.width||manual.height!==scope.height)return selected;
  return copySubimagesSelectionPolicy(manual.subimagesSelection);
 }
 const initial=scope?.individual?.initialSourceSelection;
 if(initial&&!scope.manual&&initial.sourceSha256===scope.sourceSha256&&initial.width===scope.width&&initial.height===scope.height)return copySubimagesSelectionPolicy(initial);
 const source=scope?.sourceRegions??scope?.originalSourceRegions;
 if(source?.schema!=='sherloq.source-regions/1'||source.sourceSha256!==scope?.sourceSha256||source.width!==scope?.width||source.height!==scope?.height||
    !(source.enabled===false||source.enabled===true&&source.positiveMode==='whole'))return selected;
 const zone=scope.manual?.zones?.find(value=>value.kind==='acquisition'&&value.id==='original-whole');
 if(!zone||zone.x0!==0||zone.y0!==0||zone.x1!==scope.width||zone.y1!==scope.height||
    JSON.stringify(zone.polygon)!==JSON.stringify([[0,0],[scope.width,0],[scope.width,scope.height],[0,scope.height]]))return selected;
 // A deliberate edit of that acquisition makes it explicit, even if its final
 // bounds again cover the entire image. Never delete it by geometric inference.
 if(scope.manual.truncatedActions>0||(scope.manual.actions??[]).some(action=>action.id===zone.id))return selected;
 return{positiveMode:'whole',afterLastAcquisitionDelete:'selected',implicitWholeId:zone.id};
}
