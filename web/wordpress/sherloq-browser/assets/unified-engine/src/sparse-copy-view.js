import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createGeometryKernel,biomeSides,distinctCentres} from './copy-geometry.js';
export function sparseCopyViewParams(input={}){
 const p={low:0,high:100000,minimum:4,chosen:[],hidden:[],circles:true,lines:true,points:false,areas:true,textExclusions:false,...input};
 requireValue(Number.isFinite(p.low)&&p.low>=0&&Number.isFinite(p.high)&&p.high>=p.low&&Number.isInteger(p.minimum)&&p.minimum>=1,'Invalid sparse display filter.');
 for(const name of ['chosen','hidden'])requireValue(Array.isArray(p[name])&&p[name].every(i=>Number.isSafeInteger(i)&&i>=0),'Invalid sparse selected group.');
 for(const name of ['circles','lines','points','areas','textExclusions'])requireValue(typeof p[name]==='boolean','Invalid sparse drawing switch.');return p;
}
export async function renderSparseCopy(image,result,input={}, {signal,reserveMemory}={}){
 const p=sparseCopyViewParams(input);requireValue(typeof reserveMemory==='function','Sparse presentation requires shared admission.');
 reserveMemory(result.pairs.length/4*112+4096);const kernel=await createGeometryKernel({signal,reserveMemory,heapBytes:Math.ceil(Math.max(256*1024**2,image.data.byteLength*2+result.points.length*8+result.pairs.byteLength*5+result.colors.byteLength+32*1024**2)/65536)*65536}),visible=[],legend=[],selectedGroups=[];let renderer;
 try{
  renderer=kernel.renderer(image,result.points,result.pairs,result.colors);
  const chosen=new Set(p.chosen),hidden=new Set(p.hidden),flags=(p.circles?1:0)|(p.lines?2:0)|(p.points?4:0)|(p.areas?8:0);
  for(let index=0;index<result.groups.length;index++){
   await controlCheckpoint(signal);const group=result.groups[index],rows=group.filter(row=>result.pairs[row*4+3]>=p.low&&result.pairs[row*4+3]<=p.high);if(rows.length<p.minimum)continue;
   const {a,b}=biomeSides(result.points,result.pairs,rows);if(Math.min(distinctCentres(a),distinctCentres(b))<p.minimum)continue;
   let overlap=result.self_match_filter?.maximum_overlap;
   if(overlap===undefined&&result.mirror_policy&&group.length&&group[0]>=result.mirror_policy.base_pair_count)overlap=result.mirror_policy.maximum_overlap;
   if(overlap!==undefined&&kernel.overlap(a,b)>=overlap)continue;
   legend.push([index,rows.length,group.length]);if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;
   visible.push([index,rows.length]);selectedGroups.push({index,rows});renderer.group(rows,result.bases[index],flags);
  }
  if(p.textExclusions)for(const poly of result.preprocessing?.text_exclusions??[]){checkAbort(signal);renderer.polygon(poly);}
  checkAbort(signal);return {pixels:{format:'rgb8',width:image.width,height:image.height,data:renderer.pixels()},visible,legend,selectedGroups,style:p};
 }finally{try{renderer?.dispose();}finally{kernel.dispose();}}
}
