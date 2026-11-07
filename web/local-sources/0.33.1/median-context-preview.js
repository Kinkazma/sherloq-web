import {compileOriginalSourceRegions} from './unified-engine/src/source-region-geometry.js';
import {medianGeometry,medianGrid} from './unified-engine/src/median.js';
import {MEDIAN_FORMATS} from './unified-engine/src/median-features.js';
import {createCooperator,checkAbort,EngineError} from './unified-engine/src/errors.js';

// These cap optional presentation metadata, never native analysis or its tables.
export const MEDIAN_PREVIEW_MAX_CONTEXTS=8192,MEDIAN_PREVIEW_MAX_CELLS=131072;
// Separate maps/validation metadata. The existing retained presenter admission
// already carries MAX_CELLS*16, covering one medianGrid result at a time
// (FP32 filtered + two U8 masks + RGB8 =9 bytes/cell, nine FP32 neighbors).
// These are conservative logical credits, not physical JS heap measurements.
export const MEDIAN_CONTEXT_PREVIEW_WORKING_BYTES=MEDIAN_PREVIEW_MAX_CONTEXTS*512+65536;
const mutable=new Set(['variance','threshold','speckle','showScore']);
const fail=message=>{throw new EngineError('PREVIEW_UNAVAILABLE',message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validSha=value=>/^[a-f0-9]{64}$/.test(value??'');
const surface=value=>value&&value.format==='rgb8'&&typeof value.id==='string'&&Number.isSafeInteger(value.revision)&&value.revision>0;

/** Cheap source/basis eligibility only. Full coverage/grid validation occurs
 * after the caller reserves retainedPreviewWorkingBytes, before RGB is read. */
export function medianContextPreviewCandidate({output,source,domain,params={},backend='auto'}={}){
 const data=output?.data,descriptor=domain?.descriptor??domain,grid=output?.provenance?.sourceRegionGrid,sourceGrid=source?.surface,sha=domain?.sourceSha256??descriptor?.snapshot?.sourceSha256,sw=domain?.sourceWidth??descriptor?.snapshot?.width,sh=domain?.sourceHeight??descriptor?.snapshot?.height,prior=output?.provenance?.params,model=data?.model,view=output?.sourceRegionSourceSurface;
 if(output?.operation!=='various.median'||!['cpu','auto'].includes(backend)||!validSha(source?.sha256)||source.sha256!==sha||output.provenance?.originalSha256!==sha||output.sourceRegionDomain?.fingerprint!==descriptor?.fingerprint||output.provenance?.sourceRegionDomain?.fingerprint!==descriptor?.fingerprint||data?.sourceRegionFingerprint!==descriptor?.fingerprint||data.gridCoordinates!=='independent-native64x64-block-grids'||!Array.isArray(data.fragments)||!data.fragments.length||data.fragments.length>MEDIAN_PREVIEW_MAX_CONTEXTS||!surface(sourceGrid)||sourceGrid.width!==sw||sourceGrid.height!==sh||!surface(view)||view.width!==descriptor.width||view.height!==descriptor.height||data.width!==descriptor.width||data.height!==descriptor.height||!grid||grid.width!==descriptor.width||grid.height!==descriptor.height||grid.sourceWidth!==sw||grid.sourceHeight!==sh||!same(output.sourceRegionOrigin,descriptor.origin)||!validSha(model?.sourceSha256)||typeof model.id!=='string'||!Object.hasOwn(MEDIAN_FORMATS,model.features)||!prior)return false;
 const reference=output.provenance?.references?.find(r=>r.id===model.id&&r.kind==='median-model');if(reference?.originalSha256!==model.sourceSha256)return false;
 for(const key of new Set([...Object.keys(params),...Object.keys(prior)]))if(!mutable.has(key)){
  const alias=key==='modelId'&&params[key]===''&&prior[key]==='median-model'&&model.id==='median-model';
  if(!alias&&!same(params[key],prior[key]))return false;
 }
 return prior.modelId===model.id;
}

/** Reproduce only the existing view.admittedRectangles geometry order. No
 * source reader exists in this validation stage. Cooperation keeps abort live
 * even if a tall rectangle has no completed row until its lower boundary. */
async function contexts(output,domain,{signal}={}){
 const data=output.data,cooperate=createCooperator(signal),validated=[];let active=new Map(),index=0,cells=0,pixels=0;
 const accept=async rect=>{
  checkAbort(signal);const f=data.fragments[index],bounds=[rect.x,rect.y,rect.x+rect.width,rect.y+rect.height],originalBounds=bounds.map((v,i)=>v+domain.origin[i%2]),g=medianGeometry(rect.width,rect.height),n=g.width*g.height;
  if(!f||f.id!=='fragment_'+index||f.status!=='analysed'||f.blockPhase!=='local-to-complete-native-context'||!same(f.bounds,bounds)||!same(f.originalBounds,originalBounds)||!same(f.native?.geometry,g))fail('Retained median context geometry differs from its exact admitted rectangle.');
  if(!Number.isSafeInteger(n)||n<1||n>MEDIAN_PREVIEW_MAX_CELLS||cells+n>MEDIAN_PREVIEW_MAX_CELLS)fail('Retained median preview exceeds its optional compact-grid workspace.');
  const a=f.native;if(!(a.probabilities instanceof Float32Array)||a.probabilities.length!==n||!(a.variances instanceof Float64Array)||a.variances.length!==n||!(a.margins instanceof Float32Array)||a.margins.length!==n||!(a.filtered instanceof Float32Array)||a.filtered.length!==n)fail('Complete typed native median grids are required for a context preview.');
  for(let j=0;j<n;j++){if((j&4095)===0)await cooperate();if(!Number.isFinite(a.probabilities[j])||a.probabilities[j]<0||a.probabilities[j]>1||!Number.isFinite(a.variances[j])||a.variances[j]<0||!Number.isFinite(a.margins[j])||!Number.isFinite(a.filtered[j]))fail('Retained median grids contain invalid native values.');}
  for(const key of ['valid','decisions']){const mask=f.nativeMasks?.[key];if(mask?.format!=='mask8'||mask.width!==g.width||mask.height!==g.height||!(mask.data instanceof Uint8Array)||mask.data.length!==n)fail('Retained median native grid masks are incomplete.');for(let j=0;j<n;j++)if(mask.data[j]>(key==='valid'?1:2))fail('Retained median native grid masks contain invalid decisions.');}
  validated.push(f);cells+=n;pixels+=rect.width*rect.height;index++;
 };
 for(let y=0;y<domain.height;y++){
  await cooperate();const spans=domain.rowIntervals(y);if(spans.length>MEDIAN_PREVIEW_MAX_CONTEXTS)fail('Retained median preview context complexity exceeds its workspace.');const next=new Map();
  for(const[x,right]of spans){const key=x+':'+right,prior=active.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x,y,width:right-x,height:1});}
  for(const[key,value]of active)if(!next.has(key))await accept(value);active=next;
 }
 for(const value of active.values())await accept(value);
 if(index!==data.fragments.length||pixels!==domain.countIncluded)fail('Retained median contexts do not cover the current admitted population.');
 return{fragments:validated,cells,cooperate};
}

/** Display-only composition. Each native compact grid remains independent.
 * Exact native interpolation is still performed only by the existing retained
 * final endpoint. This draft samples its64px grid, like the legacy flat draft. */
export async function renderMedianContextPreview({output,source,params,domain:input,geometry:g,readSource,signal}={}){
 if(!medianContextPreviewCandidate({output,source,params,domain:input}))return null;
 const domain=await compileOriginalSourceRegions(input??output.sourceRegionDomain);checkAbort(signal);const {fragments,cells,cooperate}=await contexts(output,domain,{signal});
 const base=await readSource();checkAbort(signal);if(!base||base.format!=='rgb8'||base.width!==g.width||base.height!==g.height||!(base.data instanceof Uint8Array)||base.data.length!==g.width*g.height*3)fail('Retained median presentation source returned another sampled grid.');
 // sourceFrame already returns its own copy; do not modify a native RGB/table.
 const data=base.data;
 for(const f of fragments){
  await cooperate();const [x0,y0,x1,y1]=f.bounds,rendered=await medianGrid(f.native,params,{signal,cooperate}),native=f.native.geometry;
  for(let y=Math.ceil(y0/g.step);y<g.height&&y*g.step<y1;y++){await cooperate();const row=Math.min(native.height-1,Math.floor((y*g.step-y0)/64));
   for(let x=Math.ceil(x0/g.step);x<g.width&&x*g.step<x1;x++){const col=Math.min(native.width-1,Math.floor((x*g.step-x0)/64)),at=(row*native.width+col)*3;data.set(rendered.rgb.subarray(at,at+3),(y*g.width+x)*3);}
  }
 }
 checkAbort(signal);return{width:g.width,height:g.height,format:'rgb8',data,logicalWidth:g.w,logicalHeight:g.h,provisional:true,previewCoordinates:'source',medianContextPreview:{schema:'median-context-preview/1',contexts:fragments.length,cells,sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,origin:[...domain.origin],sampling:'provisional-independent-native64-grid-cells; exact native interpolation on commit',nativeTablesUnchanged:true}};
}
