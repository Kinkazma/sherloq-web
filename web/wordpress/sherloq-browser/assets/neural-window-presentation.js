import {EngineError,requireValue} from './unified-engine/src/errors.js';
import {displayGeometry} from './unified-engine/src/display-sampling.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';

// Separate cards retain separate native fields. This only repositions reads;
// no probabilities, masks, components or banks are merged across windows.
export function cloneAnalysisWindowDisplays(output,makeViews,language='fr'){
 const mode=output?.cloneWindowMode;
 requireValue(output?.operation==='ai.clones.segmentation'&&['independent','global'].includes(mode)&&output.provenance?.cloneWindowMode===mode&&Array.isArray(output.windowResults),'Actually executed native segmentation window mode required');
 const source=output.sourceRegionSourceSurface,domain=output.sourceRegionDomain,width=source?.width??domain?.sourceWidth,height=source?.height??domain?.sourceHeight;
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Original presentation grid required');
 const displays=[],global=output.globalResult;
 const windows=mode==='global'?(global?[{id:global.analysisWindow?.id??'global-analysis',kind:'global',fingerprint:global.analysisWindow?.fingerprint,origin:global.sourceRegionOrigin,output:global}]:[]):output.windowResults;
 for(const window of windows){
  if(window.status==='empty'||!window.output)continue;
  const native=window.output;requireValue(native.cloneWindowMode===mode&&native.provenance?.cloneWindowMode===mode&&native.analysisWindow?.fingerprint===window.fingerprint,'Window presentation cannot echo an ignored mode');
  if(native.status==='insufficient-support'){const support=native.data?.metadata?.nativeSupport;requireValue(support?.calculationPerformed===false&&support.negativeModelObservation===false&&Number.isSafeInteger(support.requiredCandidates)&&Number.isSafeInteger(support.availableCandidates)&&support.availableCandidates>=0&&support.availableCandidates<support.requiredCandidates,'A no-calculation response must retain its native support reason');continue;}
  const origin=native.sourceRegionOrigin??window.origin,w=native.surface?.width,h=native.surface?.height;
  requireValue(Array.isArray(origin)&&origin.length===2&&origin.every(Number.isSafeInteger)&&origin[0]>=0&&origin[1]>=0&&Number.isSafeInteger(w)&&w>0&&Number.isSafeInteger(h)&&h>0&&origin[0]+w<=width&&origin[1]+h<=height,'Native field placement escapes Original');
  const label=mode==='global'?(language==='fr'?'Analyse commune':'Joint analysis'):(window.kind==='envelope'?(language==='fr'?'Zone englobante':'Envelope'):(language==='fr'?'Zone':'Region'))+' '+window.id;
  for(const view of makeViews(native,language)??[]){const display=view.display;displays.push({...view,label:label+' · '+view.label,display:{...display,width,height,sourceRegionOrigin:[0,0],...(source?{sourceRegionSourceSurface:source}:{}),cloneWindowSourceSha256:native.provenance.originalSha256??output.provenance.originalSha256,cloneWindowPlacement:{id:window.id,kind:window.kind,origin:[...origin],width:w,height:h,fingerprint:window.fingerprint,mode},cloneWindowMode:mode}});}
 }
 return displays;
}

export function cloneScientificField(display){
 const key=display.cloneView==='overlay'?'map':display.cloneView,field=display.cloneFields?.[key];
 requireValue(field?.id&&Number.isInteger(field.revision),'Native scientific field is unavailable');
 return{...field,...(display.cloneWindowPlacement?{cloneExportOrigin:[...display.cloneWindowPlacement.origin],cloneWindowFingerprint:display.cloneWindowPlacement.fingerprint}:{})};
}

export async function renderCloneAnalysisWindow(display,tile,{readField,readOriginal,compose}={}){
 const p=display.cloneWindowPlacement,g=displayGeometry(display,tile);
 requireValue(['independent','global'].includes(p?.mode)&&Array.isArray(p.origin)&&p.origin.every(Number.isSafeInteger)&&typeof readField==='function'&&typeof readOriginal==='function'&&typeof compose==='function','Exact independent window renderer required');
 const count=g.width*g.height;requireValue(Number.isSafeInteger(count),'Exact native display window size required');
 const[x,y]=p.origin,left=Math.max(0,Math.ceil((x-g.x)/g.step)),right=Math.min(g.width,Math.ceil((x+p.width-g.x)/g.step)),top=Math.max(0,Math.ceil((y-g.y)/g.step)),bottom=Math.min(g.height,Math.ceil((y+p.height-g.y)/g.step));
 const samplesX=Math.max(0,right-left),samplesY=Math.max(0,bottom-top),hasSamples=samplesX>0&&samplesY>0,values=new Float32Array(count),support=new Float32Array(count);
 const local=hasSamples?{x:g.x+left*g.step-x,y:g.y+top*g.step-y,w:(samplesX-1)*g.step+1,h:(samplesY-1)*g.step+1,step:g.step}:null;
 const place=async(key,target)=>{if(!hasSamples)return;const frame=await readField(key,local);requireValue(frame?.width===samplesX&&frame.height===samplesY&&frame.format==='rgb8'&&frame.data?.length===samplesX*samplesY*3,'Native field returned another sampled grid');for(let row=0;row<samplesY;row++)for(let column=0;column<samplesX;column++)target[(top+row)*g.width+left+column]=frame.data[(row*samplesX+column)*3]/255;};
 const field=display.cloneView==='overlay'?'map':display.cloneView;await place(field,values);
 if(display.cloneFields.analyzed)await place('analyzed',support);else if(hasSamples)for(let row=top;row<bottom;row++)support.fill(1,row*g.width+left,row*g.width+right);
 let mask;if(display.cloneView==='overlay'&&display.cloneMasked){mask=new Float32Array(count);await place('mask',mask);}
 let base;if(display.cloneView!=='mask'){const frame=await readOriginal(tile);requireValue(frame?.format==='rgb8'&&frame.width===g.width&&frame.height===g.height&&frame.data?.length===count*3,'Original presentation returned another sampled grid');base=frame.data;}
 return compose({width:g.width,height:g.height,base,values,support,mask,view:display.cloneView,masked:display.cloneMasked});
}

// The same native display limit applies. Additional client-side sampling and
// composition arrays are charged before allocation and stay owned on a refused
// ACK, including a reserve which resolves after disposal starts.
export function createCloneWindowPresenter({reserve,release}={}){
 requireValue(typeof reserve==='function'&&typeof release==='function','Acknowledged presentation workspace required');
 const owners=new Set();let closed=false,closing;
 const retire=async owner=>{await owner.retire();owners.delete(owner);};
 const drain=()=>retireCompositeOwners([...owners].map(owner=>()=>retire(owner)));
 function render(display,tile,dependencies){
  requireValue(!closed,'Independent window presenter retired');const previous=[...owners];let lease,work,retiring;
  const owner={retire(){if(retiring)return retiring;retiring=(async()=>{try{await work;}catch{}if(lease){await release(lease);lease=undefined;}})().finally(()=>retiring=undefined);return retiring;}};owners.add(owner);
  work=Promise.resolve().then(async()=>{await retireCompositeOwners(previous.map(value=>()=>retire(value)));requireValue(!closed,'Window presenter retired before admission');const g=displayGeometry(display,tile);lease=await reserve(65536+g.width*g.height*32);requireValue(!closed,'Window presenter retired during admission');return renderCloneAnalysisWindow(display,tile,dependencies);});
  return work.then(async value=>{await retire(owner);return value;},async primary=>{await retireCompositeOwners([()=>retire(owner)],{primary});throw primary;});
 }
 function dispose(){if(closing)return closing;closed=true;closing=drain().finally(()=>closing=undefined);return closing;}
 return Object.freeze({render,drain,dispose,get pendingACKs(){return owners.size;}});
}
