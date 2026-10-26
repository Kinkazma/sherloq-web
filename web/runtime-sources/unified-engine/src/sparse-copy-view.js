import "../../runtime-context.js?v=0.25.0";
import {selectSparseTraceRows,traceSelectionSummary,sparseTraceDrawCommands} from './sparse-trace-selection.js';
import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {createGeometryKernel,biomeSides,distinctCentres} from './copy-geometry.js';
export function sparseCopyViewParams(input={}){
 const p={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:true,lines:true,points:false,areas:true,textExclusions:false,traceOverlap:0,...input};
 requireValue(Number.isFinite(p.low)&&p.low>=0&&Number.isFinite(p.high)&&p.high>=p.low&&Number.isInteger(p.minimum)&&p.minimum>=1,'Invalid sparse display filter.');
 requireValue(Number.isInteger(p.traceOverlap)&&p.traceOverlap>=0&&p.traceOverlap<=100,'Invalid trace overlap percentage.');
 for(const name of ['chosen','hidden'])requireValue(Array.isArray(p[name])&&p[name].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid sparse selected group.');
 for(const name of ['circles','lines','points','areas','textExclusions'])requireValue(typeof p[name]==='boolean','Invalid sparse drawing switch.');return p;
}
export async function renderSparseCopy(image,result,input={}, {signal,reserveMemory,tracePrefixCache}={}){
 const p=sparseCopyViewParams(input);requireValue(typeof reserveMemory==='function','Sparse presentation requires shared admission.');
 const nativeMask=result.params?.algorithm==='SSG'&&result.mask!==undefined;
 if(nativeMask)requireValue(result.mask instanceof Uint8Array&&result.mask.length===image.width*image.height&&result.width===image.width&&result.height===image.height,'SSG localization must use original image coordinates.');
 reserveMemory(result.pairs.length/4*112+4096);const kernel=await createGeometryKernel({signal,reserveMemory,heapBytes:Math.ceil(Math.max(256*1024**2,image.data.byteLength*2+result.points.length*8+result.pairs.byteLength*5+result.colors.byteLength+32*1024**2)/65536)*65536}),visible=[],legend=[],selectedGroups=[];let renderer,trace;
 try{
  renderer=kernel.renderer(image,result.points,result.pairs,result.colors);
  const chosen=new Set(p.chosen),hidden=new Set(p.hidden),flags=(p.circles?1:0)|(p.lines?2:0)|(p.points?4:0)|(p.areas&&!nativeMask?8:0);
  const cooperateGroups=tracePrefixCache?createCooperator(signal):null;
  for(let index=0;index<result.groups.length;index++){
   if(cooperateGroups)await cooperateGroups();else await controlCheckpoint(signal);const group=result.groups[index],rows=group.filter(row=>result.pairs[row*4+3]>=p.low&&result.pairs[row*4+3]<=p.high);if(rows.length<p.minimum)continue;
   const {a,b}=biomeSides(result.points,result.pairs,rows);if(Math.min(distinctCentres(a),distinctCentres(b))<p.minimum)continue;
   let overlap=result.self_match_filter?.maximum_overlap;
   if(overlap===undefined&&result.mirror_policy&&group.length&&group[0]>=result.mirror_policy.base_pair_count)overlap=result.mirror_policy.maximum_overlap;
   if(overlap!==undefined&&kernel.overlap(a,b)>=overlap)continue;
   legend.push([index,rows.length,group.length]);if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;
   visible.push([index,rows.length]);selectedGroups.push({index,rows});
  }
  const traceFlags=flags&7;let traceSelection;
  for(const group of selectedGroups)if(flags&8)renderer.group(group.rows,result.bases[group.index],8);
  if(!traceFlags)traceSelection=traceSelectionSummary(result,selectedGroups,[],p.traceOverlap,{selectionSkipped:true});
  else{trace=await selectSparseTraceRows(result,selectedGroups,p.traceOverlap,{reserveMemory,signal,tracePrefixCache});traceSelection=trace.metadata;renderer.colors(trace.colors);for(const command of sparseTraceDrawCommands(trace,traceFlags)){checkAbort(signal);renderer.group(command.rows,result.bases[selectedGroups[command.group].index],command.flags);}}
  if(p.textExclusions)for(const poly of result.preprocessing?.text_exclusions??[]){checkAbort(signal);renderer.polygon(poly);}
  checkAbort(signal);const pixels=renderer.pixels();
  // The localized SSG mask is the SSIM/ROI output, not a hull of sparse points.
  // Its union remains independent of the sparse-link presentation filters.
  if(nativeMask&&p.areas)for(let y=0;y<image.height;y++){
   if(y%32===0)await controlCheckpoint(signal);
   for(let x=0;x<image.width;x++){const at=y*image.width+x;if(!result.mask[at])continue;const rgb=at*3;pixels[rgb]=Math.round(pixels[rgb]*.5+255*.5);pixels[rgb+1]=Math.round(pixels[rgb+1]*.5+50*.5);pixels[rgb+2]=Math.round(pixels[rgb+2]*.5+25*.5);}
  }
  checkAbort(signal);return {pixels:{format:'rgb8',width:image.width,height:image.height,data:pixels},visible,legend,selectedGroups,style:p,traceSelection};
 }finally{try{trace?.release?.();renderer?.dispose();}finally{kernel.dispose();}}
}
