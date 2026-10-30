import {biomeAreaReferences,alignedParent,biomeAreaWorkingBytes} from './sparse-biome-area.js';
import {biomeMethod,pairedBiomeMethod,needsBiomeFormation,biomeFormationSelectionCounts,formCorrespondenceBiomes} from './sparse-biome-correspondence.js';
import {retireDenseOwners} from './dense-owner-retirement.js';
import {selectSparseTraceRows,traceSelectionSummary,sparseTraceDrawCommands,traceSelectionWorkingBytes} from './sparse-trace-selection.js';
import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {createGeometryKernel,biomeSides,distinctCentres} from './copy-geometry.js';
export function sparseCopyViewParams(input={}){
 const p={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:true,lines:true,points:false,areas:true,textExclusions:false,traceOverlap:0,maxBiomeArea:100,circleScale:100,clipLinesToCircles:false,biomeMethod:'paired-local',...input};biomeMethod(p);
 requireValue(Number.isFinite(p.low)&&p.low>=0&&Number.isFinite(p.high)&&p.high>=p.low&&Number.isInteger(p.minimum)&&p.minimum>=1,'Invalid sparse display filter.');
 requireValue(Number.isInteger(p.maxBiomeArea)&&p.maxBiomeArea>=1&&p.maxBiomeArea<=100,'Invalid maximum biome area percentage.');
 requireValue(Number.isInteger(p.traceOverlap)&&p.traceOverlap>=0&&p.traceOverlap<=100,'Invalid trace overlap percentage.');
 requireValue(Number.isInteger(p.circleScale)&&p.circleScale>=1&&p.circleScale<=300&&typeof p.clipLinesToCircles==='boolean','Invalid circle size or clipped-link style.');
 for(const name of ['chosen','hidden'])requireValue(Array.isArray(p[name])&&p[name].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid sparse selected group.');
 for(const name of ['circles','lines','points','areas','textExclusions'])requireValue(typeof p[name]==='boolean','Invalid sparse drawing switch.');return p;
}
export async function renderSparseCopy(image,result,input={}, {signal,reserveMemory,tracePrefixCache,traceCommands,analysisImage=image}={}){
 const p=sparseCopyViewParams(input),nativeMask=result.params?.algorithm==='SSG'&&result.mask!==undefined,formation=!nativeMask&&needsBiomeFormation(p);requireValue(typeof reserveMemory==='function','Sparse presentation requires shared admission.');
 if(traceCommands){
  // Before the historical geometry/frame reservations can reclaim anything,
  // discard optional storage if it would make this SAME frame inadmissible.
  const heap=Math.ceil(Math.max(256*1024**2,image.data.byteLength*2+result.points.length*8+result.pairs.byteLength*5+result.colors.byteLength+32*1024**2)/65536)*65536;
  const full=heap+8*1024**2+result.pairs.length/4*112+8192+image.data.byteLength*4+traceSelectionWorkingBytes(result,result.groups.map((rows,index)=>({rows,index})));
  requireValue(Number.isSafeInteger(full),'Sparse presentation admission bound');await traceCommands.prepareFrame(full+(formation?biomeAreaWorkingBytes(result,analysisImage,biomeFormationSelectionCounts(result,p)):0));checkAbort(signal);
 }
 if(nativeMask)requireValue(result.mask instanceof Uint8Array&&result.mask.length===image.width*image.height&&result.width===image.width&&result.height===image.height,'SSG localization must use original image coordinates.');
 reserveMemory(result.pairs.length/4*112+4096);const kernel=await createGeometryKernel({signal,reserveMemory,heapBytes:Math.ceil(Math.max(256*1024**2,image.data.byteLength*2+result.points.length*8+result.pairs.byteLength*5+result.colors.byteLength+32*1024**2)/65536)*65536}),visible=[],legend=[],selectedGroups=[];let renderer,trace,hasPrimary=false;
 try{
  renderer=kernel.renderer(image,result.points,result.pairs,result.colors,{circleScale:p.circleScale,clipLinesToCircles:p.clipLinesToCircles,circles:p.circles});
  const chosen=new Set(p.chosen),hidden=new Set(p.hidden),flags=(p.circles?1:0)|(p.lines?2:0)|(p.points?4:0)|(p.areas&&!nativeMask?8:0);
  const cooperateGroups=tracePrefixCache?createCooperator(signal):null;
  for(let index=0;index<result.groups.length;index++){
   if(cooperateGroups)await cooperateGroups();else await controlCheckpoint(signal);const group=result.groups[index],rows=group.filter(row=>result.pairs[row*4+3]>=p.low&&result.pairs[row*4+3]<=p.high);if(rows.length<p.minimum)continue;
   const oriented=pairedBiomeMethod(p.biomeMethod)&&!nativeMask?alignedParent(result,index,rows):null,{a,b}=oriented?{a:oriented.a.flat(),b:oriented.b.flat()}:biomeSides(result.points,result.pairs,rows);if(Math.min(distinctCentres(a),distinctCentres(b))<p.minimum)continue;
   let overlap=result.self_match_filter?.maximum_overlap;
   if(overlap===undefined&&result.mirror_policy&&group.length&&group[0]>=result.mirror_policy.base_pair_count)overlap=result.mirror_policy.maximum_overlap;
   if(!pairedBiomeMethod(p.biomeMethod)&&overlap!==undefined&&kernel.overlap(a,b)>=overlap)continue;
   legend.push([index,rows.length,group.length]);if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;
   visible.push([index,rows.length]);selectedGroups.push({index,rows});
  }
  let biomeArea=null;
  if(formation){
   const areaBytes=biomeAreaWorkingBytes(result,analysisImage,{rows:selectedGroups.reduce((n,g)=>n+g.rows.length,0),groups:selectedGroups.length});
   if(tracePrefixCache?.reserveFrame)await tracePrefixCache.reserveFrame(areaBytes,reserveMemory,{signal});else reserveMemory(areaBytes);
   checkAbort(signal);
   biomeArea=await formCorrespondenceBiomes(result,selectedGroups,p.maxBiomeArea,biomeAreaReferences(image,result,analysisImage),{view:p,signal,minimum:p.minimum,reserveMemory:bytes=>{requireValue(bytes<=areaBytes,'Biome area workspace exceeds its frame admission.');}});
  }
  const traceFlags=flags&7;let traceSelection;
  if(flags&8){if(biomeArea)for(const group of biomeArea.leaves)renderer.biomeContours(group.hulls,group.colorBgr??result.bases[group.index],{supportOnly:group.supportOnly,supportCentres:group.supportCentres});else for(const group of selectedGroups)renderer.group(group.rows,result.bases[group.index],8);}
  if(!traceFlags)traceSelection=traceSelectionSummary(result,selectedGroups,[],p.traceOverlap,{selectionSkipped:true});
  else{trace=traceCommands&&!traceCommands.stats.disabled?await traceCommands.select(result,selectedGroups,p,{reserveMemory,signal}):await selectSparseTraceRows(result,selectedGroups,p.traceOverlap,{reserveMemory,signal,tracePrefixCache,circleScale:p.circleScale});traceSelection=trace.metadata;renderer.colors(trace.colors);for(const command of sparseTraceDrawCommands(trace,traceFlags)){checkAbort(signal);renderer.group(command.rows,result.bases[selectedGroups[command.group].index],command.flags);}}
  if(p.circleScale!==100||p.clipLinesToCircles)traceSelection={...traceSelection,circleScale:p.circleScale,clipLinesToCircles:p.clipLinesToCircles,effectiveClipLinesToCircles:p.clipLinesToCircles&&p.circles};
  if(biomeArea)traceSelection={...traceSelection,biomeArea:biomeArea.metadata};
  traceSelection={...traceSelection,biomeFormation:{method:nativeMask?'native-mask':p.biomeMethod,effectiveMaxBiomeArea:nativeMask||p.biomeMethod==='native'?100:p.maxBiomeArea,nativeHistorical:!nativeMask&&p.biomeMethod==='native',inferenceCalls:0,matchingCalls:0,fitCalls:0}};
  if(p.textExclusions)for(const poly of result.preprocessing?.text_exclusions??[]){checkAbort(signal);renderer.polygon(poly);}
  checkAbort(signal);const pixels=renderer.pixels();
  // The localized SSG mask is the SSIM/ROI output, not a hull of sparse points.
  // Its union remains independent of the sparse-link presentation filters.
  if(nativeMask&&p.areas)for(let y=0;y<image.height;y++){
   if(y%32===0)await controlCheckpoint(signal);
   for(let x=0;x<image.width;x++){const at=y*image.width+x;if(!result.mask[at])continue;const rgb=at*3;pixels[rgb]=Math.round(pixels[rgb]*.5+255*.5);pixels[rgb+1]=Math.round(pixels[rgb+1]*.5+50*.5);pixels[rgb+2]=Math.round(pixels[rgb+2]*.5+25*.5);}
  }
  checkAbort(signal);return {pixels:{format:'rgb8',width:image.width,height:image.height,data:pixels},visible,legend,selectedGroups,style:p,traceSelection};
 }catch(error){hasPrimary=true;throw error;}finally{
  if(traceCommands){try{await retireDenseOwners([()=>trace?.release?.(),()=>renderer?.dispose(),()=>kernel.dispose()]);}catch(error){if(!hasPrimary)throw error;}}
  else{try{trace?.release?.();renderer?.dispose();}finally{kernel.dispose();}}
 }
}
