// Progress counters are optional: a valid fraction does not imply a native
// completed count, and a field's fraction is not an end-to-end estimate.
export function hasProgressCounts(event) {
 return Number.isFinite(event?.completed)&&Number.isFinite(event?.total)&&event.total>0;
}
export function progressFraction(event) {
 const value=Number.isFinite(event?.fraction)?event.fraction:hasProgressCounts(event)?event.completed/event.total:null;
 return value===null?null:Math.max(0,Math.min(1,value));
}
export function progressText(prefix,event,{counts=true,stage=false,language='en'}={}) {
 const parts=[prefix,event?.phase];
 // Model progress is local to each genuine RGB context. Display that identity
 // without deriving a whole-analysis percentage from one context's counters.
 if(Number.isSafeInteger(event?.fragmentIndex)&&Number.isSafeInteger(event?.fragments)&&event.fragments>0&&event.fragmentIndex>=0&&event.fragmentIndex<event.fragments)parts.push((language==='fr'?'zone ':'context ')+(event.fragmentIndex+1)+'/'+event.fragments);
 if(stage)parts.push(event?.stage);
 if(counts&&hasProgressCounts(event))parts.push(event.completed+'/'+event.total);
 return parts.filter(value=>value!==undefined&&value!==null&&value!=='').join(' · ');
}
export function renderProgress(bar,event) {
 const value=progressFraction(event);
 if(value===null)bar.removeAttribute('value');else bar.value=value;
 return value;
}
