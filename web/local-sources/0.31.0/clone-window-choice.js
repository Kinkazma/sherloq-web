// This choice changes analysis scope, never native scientific parameters.
export const CLONE_WINDOW_TOOLS=Object.freeze(['tampering.copyMove.brisk','tampering.copyMove.sparse','ai.clones.d2prl','ai.sources.safire']);
export const hasCloneWindowChoice=id=>CLONE_WINDOW_TOOLS.includes(id);
export const isCloneWindowOperation=operation=>hasCloneWindowChoice(operation)||operation==='tampering.copyMove.dense'||operation==='ai.clones.segmentation'||operation==='analysis.clones'||operation==='analysis.complete';
export function restoreCloneWindowChoices(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return{};
 return Object.fromEntries(CLONE_WINDOW_TOOLS.filter(id=>Object.hasOwn(value,id)&&['independent','global'].includes(value[id])).map(id=>[id,value[id]]));
}
export function cloneWindowTaskOptions(id,choices,params){
 if(id==='tampering.copyMove.sparse'&&params?.algorithm==='EfficientLoFTR'&&params.compare===true)return{cloneWindowMode:'global'};
 return hasCloneWindowChoice(id)?{cloneWindowMode:choices?.[id]==='global'?'global':'independent'}:{};
}
