// UI aliases are separate from the extension-engine registry. The four D
// detectors share their native operation; B-Free and SPAI retain theirs.
export const AI_DETECTOR_OPERATION='ai.generation.detect';
export const AI_DETECTOR_GROUP=Object.freeze({en:'AI Generation Detectors',fr:'Détecteurs d’images IA'});
export const AI_DETECTOR_TOOLS=Object.freeze([
 {id:'ai.generation.dda',method:'dda',name:'DDA',operation:AI_DETECTOR_OPERATION},
 {id:'ai.generation.gapl',method:'gapl',name:'GAPL',operation:AI_DETECTOR_OPERATION},
 {id:'ai.generation.spai',method:'spai',name:'SPAI',operation:'ai.generation.spai'},
 {id:'ai.generation.prl',method:'prl',name:'PRL',operation:AI_DETECTOR_OPERATION},
 {id:'ai.generation.community-forensics',method:'community-forensics',name:'Community Forensics 384',operation:AI_DETECTOR_OPERATION},
 {id:'ai.generation.bfree',method:'bfree',name:'B-Free',operation:'ai.generation.bfree'}
].map(tool=>Object.freeze({...tool,fr:'⚠️ '+tool.name,en:'⚠️ '+tool.name,group:AI_DETECTOR_GROUP.en,kind:'global',experimental:true,newFeature:'yellow'})));
export const detectorTool=id=>AI_DETECTOR_TOOLS.find(tool=>tool.id===id);
export const isDetectorTool=id=>!!detectorTool(id);
export const isDetectorAlias=id=>detectorTool(id)?.operation===AI_DETECTOR_OPERATION;
export const detectorAliasForMethod=method=>AI_DETECTOR_TOOLS.find(tool=>tool.operation===AI_DETECTOR_OPERATION&&tool.method===method)?.id;
export function detectorTask(id,params={}){
 const tool=detectorTool(id);
 return {operation:tool?.operation??id,params:{...params,...(tool?.operation===AI_DETECTOR_OPERATION?{method:tool.method}:{})}};
}

const redToolbarWarnings=new Set(['ai.generation.spai','ai.generation.prl','ai.generation.community-forensics','ai.generation.bfree']);
export function colorDetectorToolbarWarning(button,id){
 if(!redToolbarWarnings.has(id))return;
 const label=button.textContent;if(!/^⚠(?:\uFE0F|\uFE0E)?\s/u.test(label))return;
 const icon=button.ownerDocument.createElement('span');icon.className='detector-warning-red';icon.textContent='⚠\uFE0E';icon.setAttribute('aria-hidden','true');
 button.setAttribute('aria-label',label);button.replaceChildren(icon,button.ownerDocument.createTextNode(' '+label.replace(/^⚠(?:\uFE0F|\uFE0E)?\s*/u,'')));
}
