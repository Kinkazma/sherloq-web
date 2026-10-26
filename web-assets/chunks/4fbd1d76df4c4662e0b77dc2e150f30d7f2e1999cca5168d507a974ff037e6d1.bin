import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {roundEven} from './copy-geometry.js';
import {buildSparseTracePalette,tracePaletteWorkingBytes} from './sparse-trace-palette.js';

// Display geometry only: the native OpenCV rounding, radius and line endpoints.
export function nativeTraceCircle(points,index){
 const at=index*7,x=roundEven(points[at]),y=roundEven(points[at+1]),radius=Math.max(2,roundEven(points[at+2]/2));
 requireValue([x,y,radius].every(Number.isSafeInteger),'Invalid native trace circle.');return{x,y,radius};
}
export function circleOverlapFraction(a,b){
 const r=a.radius,s=b.radius,d=Math.hypot(a.x-b.x,a.y-b.y);
 if(d>=r+s)return 0;if(d<=Math.abs(r-s))return 1;
 const clamp=x=>Math.max(-1,Math.min(1,x)),q=d*d;
 const area=r*r*Math.acos(clamp((q+r*r-s*s)/(2*d*r)))+s*s*Math.acos(clamp((q+s*s-r*r)/(2*d*s)))-.5*Math.sqrt(Math.max(0,(-d+r+s)*(d+r-s)*(d-r+s)*(d+r+s)));
 return Math.max(0,Math.min(1,area/(Math.PI*Math.min(r*r,s*s))));
}
export {tracePaletteWorkingBytes};
const circleKey=c=>c.x+','+c.y+','+c.radius,centreKey=c=>c.x+','+c.y;
const compareCircle=(a,b)=>a.x-b.x||a.y-b.y||a.radius-b.radius;
const ordered=(a,b,compare=compareCircle)=>compare(a,b)<=0?[a,b]:[b,a];
const compareCell=(a,b)=>a[0]-b[0]||a[1]-b[1];
export function traceSelectionWorkingBytes(result,groups){
 const all=(result.groups??groups.map(g=>g.rows)).reduce((n,g)=>n+g.length,0),eligible=groups.reduce((n,g)=>n+g.rows.length,0);
 // Conservative credits for JS maps/strings, palette, canonical order, commands,
 // and both endpoint indexes; admission precedes reading any native point.
 const familyCount=(result.groups??groups.map(g=>g.rows)).filter(g=>g.length).length;
 const bytes=all*4096+eligible*2048+result.pairs.length/4*32+tracePaletteWorkingBytes(familyCount,all)+16384;
 requireValue(Number.isSafeInteger(bytes),'Trace selection size exceeds safe admission.');return bytes;
}
export function traceSelectionSummary(result,groups,drawn,overlapPercent,extra={}){
 const eligible=new Set(),shown=new Set();let occurrences=0,drawnOccurrences=0;
 for(const group of groups)for(const row of group.rows){eligible.add(row);occurrences++;}
 for(const rows of drawn)for(const row of rows){shown.add(row);drawnOccurrences++;}
 return{schema:'sparse-trace-selection/2',overlapPercent,nativePairs:result.pairs.length/4,eligiblePairs:eligible.size,drawnPairs:shown.size,eligiblePairOccurrences:occurrences,drawnPairOccurrences:drawnOccurrences,eligibleEndpointOccurrences:2*occurrences,drawnEndpointOccurrences:2*drawnOccurrences,policy:overlapPercent===100?'all-native-pairs-distinct-glyphs':'balanced-shared-glyph-circle-overlap',order:'round-robin-native-groups-and-geometric-strata; small-area-then-geometric-ties',exactMaximum:false,nativeRowsUnchanged:true,...extra};
}
async function prepareTracePrefix(result,groups,cooperate,signal,baseline){
  const started=performance.now(),endpoints=new Map();
  const rowGeometry=row=>{
   requireValue(Number.isSafeInteger(row)&&row>=0&&row<result.pairs.length/4,'Native trace row exceeds its pair table.');let c=endpoints.get(row);if(c)return c;
   const a=result.pairs[row*4],b=result.pairs[row*4+1];requireValue(Number.isSafeInteger(a)&&a>=0&&a<result.points.length/7&&Number.isSafeInteger(b)&&b>=0&&b<result.points.length/7,'Native trace endpoint exceeds its point table.');
   const first=nativeTraceCircle(result.points,a),second=nativeTraceCircle(result.points,b),canonical=ordered(first,second);c={row,first,second,canonical,area:first.radius**2+second.radius**2};endpoints.set(row,c);return c;
  };
  // The colour graph uses full native groups, not a filtered/chosen subset.
  for(const group of result.groups??groups.map(g=>g.rows))for(const row of group){await cooperate();rowGeometry(row);}
  const geometryMs=performance.now()-started,palette=await buildSparseTracePalette({...result,groups:result.groups??groups.map(g=>g.rows)},endpoints,{cooperate,signal}),colors=palette.colors,selectionStarted=performance.now();
  const candidates=groups.map((g,group)=>Array.from(g.rows,(row,order)=>({...rowGeometry(row),group,order}))),flat=candidates.flat(),radii=flat.flatMap(c=>[c.first.radius,c.second.radius]).sort((a,b)=>a-b),cellSize=4*(radii.length?radii[Math.floor((radii.length-1)/2)]:2);
  let minX=Infinity,minY=Infinity;for(const c of flat){minX=Math.min(minX,c.first.x,c.second.x);minY=Math.min(minY,c.first.y,c.second.y);}
  const cell=c=>[Math.floor((c.x-minX)/cellSize),Math.floor((c.y-minY)/cellSize)],compare=(a,b)=>a.area-b.area||compareCircle(a.canonical[0],b.canonical[0])||compareCircle(a.canonical[1],b.canonical[1])||a.row-b.row||a.order-b.order;
  const queues=[];for(const list of candidates){const strata=new Map();for(const c of list){await cooperate();const cells=ordered(cell(c.first),cell(c.second),compareCell),key=cells.flat().join(',');let entry=strata.get(key);if(!entry){entry={cells,list:[],at:0};strata.set(key,entry);}entry.list.push(c);}const strataList=[...strata.values()].sort((a,b)=>compareCell(a.cells[0],b.cells[0])||compareCell(a.cells[1],b.cells[1]));for(const q of strataList)q.list.sort(compare);queues.push({strata:strataList,cursor:0,remaining:list.length});}
  const order=[];let pending=flat.length;while(pending){for(const q of queues){await cooperate();if(!q.remaining)continue;let entry;do{entry=q.strata[q.cursor];q.cursor=(q.cursor+1)%q.strata.length;}while(entry.at===entry.list.length);order.push(entry.list[entry.at++]);q.remaining--;pending--;}}
  const prefix={endpoints,palette,order,queues,cellSize,geometryMs,selectionStarted};
  if(baseline){const zero=createTraceState(order,groups,cooperate);await zero.pass(0);prefix.zero={levels:zero.levels,glyphs:zero.glyphs,accepted:zero.accepted,comparisons:zero.comparisons,cellsVisited:zero.cellsVisited};prefix.baselinePairs=new Set(order.filter(c=>zero.accepted[c.group].has(c.order)).map(c=>c.row)).size;}
  prefix.preparationMs=performance.now()-started;return prefix;
}
function createTraceState(order,groups,cooperate,snapshot){
  const levels=snapshot?new Map([...snapshot.levels].map(([level,grid])=>[level,{...grid,buckets:new Map([...grid.buckets].map(([key,bucket])=>[key,{...bucket,circles:[...bucket.circles]}]))}])):new Map(),glyphs=new Map(snapshot?.glyphs),accepted=snapshot?snapshot.accepted.map(rows=>new Set(rows)):groups.map(()=>new Set());let comparisons=snapshot?.comparisons??0,cellsVisited=snapshot?.cellsVisited??0;
  const insert=circle=>{const key=circleKey(circle);if(glyphs.has(key))return;glyphs.set(key,circle);const level=Math.max(0,Math.ceil(Math.log2(2*circle.radius/8))),size=8*2**level;requireValue(Number.isFinite(size),'Native trace radius exceeds spatial addressing.');let grid=levels.get(level);if(!grid){grid={size,maxRadius:0,buckets:new Map()};levels.set(level,grid);}grid.maxRadius=Math.max(grid.maxRadius,circle.radius);const x=Math.floor(circle.x/size),y=Math.floor(circle.y/size),bucketKey=x+','+y;let bucket=grid.buckets.get(bucketKey);if(!bucket){bucket={x,y,circles:[]};grid.buckets.set(bucketKey,bucket);}bucket.circles.push(circle);};
  const conflicts=(a,b,threshold)=>{comparisons++;return circleKey(a)!==circleKey(b)&&circleOverlapFraction(a,b)>threshold;};
  const overlaps=async(circle,threshold)=>{
   if(glyphs.has(circleKey(circle)))return false;
   for(const grid of levels.values()){
    const reach=circle.radius+grid.maxRadius,x0=Math.floor((circle.x-reach)/grid.size),x1=Math.floor((circle.x+reach)/grid.size),y0=Math.floor((circle.y-reach)/grid.size),y1=Math.floor((circle.y+reach)/grid.size),cellCount=(x1-x0+1)*(y1-y0+1);
    const visit=async bucket=>{if(!bucket)return false;cellsVisited++;for(const previous of bucket.circles){await cooperate();if(conflicts(circle,previous,threshold))return true;}return false;};
    if(cellCount>grid.buckets.size){for(const bucket of grid.buckets.values())if(bucket.x>=x0&&bucket.x<=x1&&bucket.y>=y0&&bucket.y<=y1&&await visit(bucket))return true;}
    else for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(await visit(grid.buckets.get(x+','+y)))return true;
   }return false;
  };
  const pass=async threshold=>{for(const c of order){await cooperate();if(accepted[c.group].has(c.order))continue;const firstNew=!glyphs.has(circleKey(c.first)),secondNew=!glyphs.has(circleKey(c.second));if(firstNew&&secondNew&&conflicts(c.first,c.second,threshold)||await overlaps(c.first,threshold)||await overlaps(c.second,threshold))continue;accepted[c.group].add(c.order);insert(c.first);insert(c.second);}};
 return{levels,glyphs,accepted,insert,pass,get comparisons(){return comparisons;},get cellsVisited(){return cellsVisited;}};
}
/** Presentation-only balanced maximal selection, not a maximum conflict set.
 * Exact shared glyphs create no additional area. The same balanced 0% base is
 * retained at every positive threshold. No nesting of positive sets is claimed.
 */
export async function selectSparseTraceRows(result,groups,overlapPercent,{reserveMemory,signal,tracePrefixCache}={}){
 requireValue(Number.isInteger(overlapPercent)&&overlapPercent>=0&&overlapPercent<=100,'Invalid trace overlap percentage.');requireValue(typeof reserveMemory==='function','Trace selection requires shared admission.');checkAbort(signal);
 const bytes=traceSelectionWorkingBytes(result,groups),release=tracePrefixCache?.reserveFrame?await tracePrefixCache.reserveFrame(bytes,reserveMemory,{signal}):reserveMemory(bytes);let complete=false;const started=performance.now();
 try{
  const cooperate=createCooperator(signal);let prefixLease;
  try{
   prefixLease=overlapPercent!==100?await tracePrefixCache?.acquire(result,groups,traceSelectionWorkingBytes(result,groups),()=>prepareTracePrefix(result,groups,cooperate,signal,true),{signal}):null;
   const prefix=prefixLease?.value??await prepareTracePrefix(result,groups,cooperate,signal,false),{endpoints,order,queues,cellSize}=prefix;
   const reused=prefixLease?.reused===true,palette=prefixLease?{...prefix.palette,metadata:structuredClone(prefix.palette.metadata)}:prefix.palette,colors=prefixLease?new Uint8Array(palette.colors):palette.colors;if(reused)palette.metadata.milliseconds=0;
   const geometryMs=reused?0:prefix.geometryMs,selectionStarted=reused?performance.now():prefix.selectionStarted,state=createTraceState(order,groups,cooperate,prefixLease?prefix.zero:undefined),{accepted,insert,pass}=state;
   let baselinePairs=prefixLease?prefix.baselinePairs:0;
  if(overlapPercent===100){for(const c of order){accepted[c.group].add(c.order);insert(c.first);insert(c.second);}}
  else{if(!prefixLease){await pass(0);baselinePairs=new Set(order.filter(c=>accepted[c.group].has(c.order)).map(c=>c.row)).size;}if(overlapPercent>0)await pass(overlapPercent/100);}
  const rows=groups.map((g,index)=>Uint32Array.from(g.rows.filter((_,i)=>accepted[index].has(i)))),circles=new Map(),centres=new Map(),lines=new Set(),commands=[],perGroup=[];
  const compareLink=(a,b)=>{for(let i=0;i<4;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;},consider=(map,key,owner)=>{const previous=map.get(key);if(!previous||compareLink(owner.link,previous.link)<0||compareLink(owner.link,previous.link)===0&&(owner.row<previous.row||owner.row===previous.row&&(owner.group<previous.group||owner.group===previous.group&&(owner.order<previous.order||owner.order===previous.order&&owner.end<previous.end))))map.set(key,owner);};
  for(let group=0;group<groups.length;group++)for(let order=0;order<rows[group].length;order++){await cooperate();const row=rows[group][order],c=endpoints.get(row),link=palette.byRow.get(row).geometry;for(const [end,circle]of[[0,c.first],[1,c.second]]){const owner={row,group,order,end,link};consider(circles,circleKey(circle),owner);consider(centres,centreKey(circle),owner);}}
  const owns=(owner,row,group,order,end)=>owner.row===row&&owner.group===group&&owner.order===order&&owner.end===end;
  for(let group=0;group<groups.length;group++){
   const buckets=new Map(),put=(flags,row)=>{let bucket=buckets.get(flags);if(!bucket){bucket=[];buckets.set(flags,bucket);}bucket.push(row);};
   for(let order=0;order<rows[group].length;order++){await cooperate();const row=rows[group][order],c=endpoints.get(row),ca=circleKey(c.first),cb=circleKey(c.second),pa=centreKey(c.first),pb=centreKey(c.second),edge=palette.byRow.get(row).key;
    if(!lines.has(edge)){put(2,row);lines.add(edge);}
    let skip=(owns(circles.get(ca),row,group,order,0)?0:16)|(owns(circles.get(cb),row,group,order,1)?0:32);if(skip!==48)put(1|skip,row);
    skip=(owns(centres.get(pa),row,group,order,0)?0:16)|(owns(centres.get(pb),row,group,order,1)?0:32);if(skip!==48)put(4|skip,row);
   }
   for(const [flags,list]of buckets)commands.push({group,flags,rows:Uint32Array.from(list)});perGroup.push({index:groups[group].index??group,eligible:groups[group].rows.length,drawn:rows[group].length,strata:queues[group].strata.length});
  }
  const metadata=traceSelectionSummary(result,groups,rows,overlapPercent,{palette:palette.metadata,sharedMarkerOwner:'smallest-selected-canonical-link; native-row/group/occurrence/endpoint-ties',colorsNativeUnchanged:true,biomesNativeUnchanged:true,uniqueCircleGlyphs:circles.size,uniqueCentreGlyphs:centres.size,uniqueLineGlyphs:lines.size,baselinePairs,maximalForOrder:true,positiveSetsNested:false,baseZeroRetained:true,cellSize,perGroup,comparisons:state.comparisons,cellsVisited:state.cellsVisited,...(prefixLease?{prefixReuse:{schema:'dense-trace-prefix/1',reused,counterSemantics:'comparisons/cellsVisited are logical full-selection totals including the retained zero prefix',currentWork:{comparisons:state.comparisons-(reused?prefix.zero.comparisons:0),cellsVisited:state.cellsVisited-(reused?prefix.zero.cellsVisited:0)},reusedWork:{comparisons:reused?prefix.zero.comparisons:0,cellsVisited:reused?prefix.zero.cellsVisited:0},preparationTiming:{geometryMs:prefix.geometryMs,paletteMs:prefix.palette.metadata.milliseconds,totalMs:prefix.preparationMs}}}:{}),timing:{geometryMs,paletteMs:palette.metadata.milliseconds,selectionAndCommandsMs:performance.now()-selectionStarted,totalMs:performance.now()-started}});
  checkAbort(signal);complete=true;return{rows,colors,commands,metadata,release};
  }finally{prefixLease?.release();}
 }finally{if(!complete)release?.();}
}
// Skip bits apply only to glyphs; line and biome primitives are unchanged.
export function sparseTraceDrawCommands(selection,traceFlags){
 return selection.commands.filter(command=>(command.flags&7)&traceFlags);
}
