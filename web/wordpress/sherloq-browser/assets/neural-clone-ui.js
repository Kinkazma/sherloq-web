import {INFERNO} from './unified-engine/src/research-palette.js';
import {displayGeometry} from './unified-engine/src/display-sampling.js';
import {neuralScientificScopeIdentity} from './unified-engine/src/neural-scientific-scope.js';
import {cloneAnalysisWindowDisplays} from './neural-window-presentation.js?v=0.30.0';
import {d2prlInputSide} from './d2prl-input-size.js?v=0.30.0';

export const NEURAL_METHODS = [
 ['cmseg-generalization','CMSeg-Net 2025 generalization'],['cmseg-addnoise','CMSeg-Net 2025 addnoise'],
 ['mgcfdn','MGCFDN 2026'],['mgcfdn-st','MGCFDN 2026 source/cible','MGCFDN 2026 source/target'],
 ['mgcfdn-16','MGCFDN 2026 16×16'],['mgcfdn-effnet','MGCFDN 2026 EffNet 16×16'],
 ['mgcfdn-mpdn','MGCFDN 2026 MPDN 16×16'],['mgcfdn-tnt','MGCFDN 2026 TNT 16×16'],['mgcfdn-vig','MGCFDN 2026 VIG 16×16'],['d2prl','D2PRL'],
 ['forgeryscope-microscopy','Forgeryscope microscopie','Forgeryscope microscopy'],
 ['forgeryscope-duplicate','Forgeryscope blots complets','Forgeryscope full blots'],
 ['forgeryscope-overlap','Forgeryscope chevauchements','Forgeryscope overlaps'],
 ['forgeryscope-lanes','Forgeryscope pistes','Forgeryscope lanes'],['forgeryscope-auto','Forgeryscope Auto'],
 ['selfdm-map','SelfDM 2022 — carte initiale (expérimental)','SelfDM 2022 — initial map (experimental)'],
 ['selfdm-proposal','SelfDM + Proposal SuperGlue · 2022 (expérimental)','SelfDM + Proposal SuperGlue · 2022 (experimental)']
];
export const isRecentNeuralMethod=method=>method?.startsWith('mgcfdn')||method?.startsWith('cmseg-')||method?.startsWith('selfdm-');
export const isForgeryscope = method => method?.startsWith('forgeryscope-');
// Drawing must select a supported manual-input contract. Preserve an explicit
// exclusion/comparison instead of silently changing the meaning of its ROIs.
export function neuralDrawingScope(method,current){
 if(isForgeryscope(method)){if(current==='exclude')return current;if(current==='compare'&&method!=='forgeryscope-auto')return current;return method==='forgeryscope-auto'?'exclude':'compare';}
 return method==='d2prl'&&current==='exclude'?'exclude':'regions';
}
export const neuralOperation = method => isForgeryscope(method)?'m2.forgeryscope':!method||method==='d2prl'?'ai.clones.d2prl':'ai.clones.segmentation';
export function forgeryscopeParams(method,scope,rectangles,language='fr') {
 const profile=method.slice('forgeryscope-'.length),bounds=rectangles.map(r=>[r.x0,r.y0,r.x1,r.y1]);
 if(scope==='exclude') {if(!bounds.length)throw Error(language==='fr'?'Dessinez une zone à exclure.':'Draw an exclusion region.');return {profile,exclusions:bounds};}
 if(scope==='compare') {if(profile==='auto'||bounds.length!==2)throw Error(language==='fr'?'Comparer exige deux rectangles et un profil Forgeryscope autre que Auto.':'Compare requires two rectangles and a non-Auto Forgeryscope profile.');return {profile,panels:bounds.map(b=>[profile==='microscopy'?'Microscopy':'Blots',1,...b])};}
 if(scope&&scope!=='whole')throw Error('Invalid Forgeryscope scope');
 return {profile};
}
const LABELS={overlay:['Superposition','Overlay'],map:['Carte brute (non filtrée)','Raw map (unfiltered)'],mask:['Masque filtré','Filtered mask'],source:['Source','Source'],target:['Cible','Target'],candidates:['Suggestions','Suggestions'],branch_microscopy:['Microscopie','Microscopy'],branch_blots:['Blots','Blots'],branch_lanes:['Pistes','Lanes'],geometric:['Correspondances géométriques','Geometric matches']};
export function neuralDisplays(output,language='fr') {
 if(output?.operation==='ai.clones.segmentation'&&['independent','global'].includes(output.cloneWindowMode)&&Array.isArray(output.windowResults))return cloneAnalysisWindowDisplays(output,neuralDisplays,language);
 const m2=output.operation==='m2.forgeryscope';
 if(!m2&&!['ai.clones.d2prl','ai.clones.segmentation'].includes(output.operation))return null;
 const fields=m2?output.m2Result.fields:{map:output.surface,...output.planeSurfaces,...output.maskSurfaces};
 if(!fields?.map||!fields?.mask)return [];
 const base=m2?{id:'forgeryscope-'+output.m2Result.id,revision:1,width:output.m2Result.width,height:output.m2Result.height}:output.surface;
 return ['overlay','map','mask','source','target','candidates','branch_microscopy','branch_blots','branch_lanes','geometric']
 .filter(view=>view==='overlay'||fields[view]&&(view!=='candidates'||m2))
 .map(view=>({label:LABELS[view][language==='fr'?0:1],display:{...base,id:base.id+':clone:'+view,format:'rgb8',cloneView:view,cloneFields:fields,cloneMasked:output.operation==='ai.clones.d2prl'||m2,...((output.operation==='ai.clones.d2prl'||m2)&&output.sourceRegionSourceSurface?{sourceRegionSourceSurface:output.sourceRegionSourceSurface,sourceRegionOrigin:output.sourceRegionOrigin,sourceRegionDomain:output.sourceRegionDomain}:{}),...(m2?{m2Result:output.m2Result.id}:{})}}));
}
// The presentation is bounded by the viewport/export window. No retained full RGB copy.
export function composeCloneFrame({width,height,base,values,support,mask,view,masked=false}) {
 const data=base?base.slice():new Uint8Array(width*height*3),branch=view.startsWith('branch_')||view==='geometric',overlay=view==='overlay'||branch;
 for(let i=0;i<width*height;i++){
  if(view==='mask'){data.fill(values[i]?255:0,i*3,i*3+3);continue;}
  if(support&&!support[i]||view==='overlay'&&masked&&!mask?.[i]||branch&&!values[i])continue;
  const index=Math.round(Math.max(0,Math.min(1,values[i]))*255)*3;
  for(let c=0;c<3;c++)data[i*3+c]=overlay?Math.round(data[i*3+c]*.55+INFERNO[index+c]*.45):INFERNO[index+c];
 }
 return {width,height,format:'rgb8',data};
}
// M2 transport allows 4 MiB numeric windows. Read contiguous strips, not one RPC per pixel/row.
export async function sampleCloneField(client,display,field,tile) {
 const g=displayGeometry(display,tile),meta=display.cloneFields[field],Type=meta.type==='Float32Array'?Float32Array:Uint8Array;
 const out=new Float32Array(g.width*g.height),limit=Math.floor(client.ready.windowBytes/Type.BYTES_PER_ELEMENT),span=(g.width-1)*g.step+1;
 for(let row=0;row<g.height;){
  const count=Math.min(g.height-row,Math.max(1,Math.floor((limit-span)/(display.width*g.step))+1));
  const offset=(g.y+row*g.step)*display.width+g.x,length=(count-1)*g.step*display.width+span;
  const values=await client.readArray(display.m2Result,field,offset,length);
  for(let y=0;y<count;y++)for(let x=0;x<g.width;x++)out[(row+y)*g.width+x]=values[y*g.step*display.width+x*g.step];
  row+=count;
 }
 return out;
}
// Only inference-affecting parameters identify a retained raw-grid analysis.
export const d2AnalysisKey = task => {
 const scope=task.params?.scientificScope;
 const identity=scope?neuralScientificScopeIdentity(scope,{width:scope.width,height:scope.height,sourceSha256:scope.sourceSha256}):null;
 return JSON.stringify([task.imageId,task.backend??'auto',d2prlInputSide(task.params?.inputSide),task.regions??[],task.params?.selectionPresent??false,identity,...(task.sourceRegionDomain?[task.sourceRegionDomain.fingerprint]:[])]);
};
