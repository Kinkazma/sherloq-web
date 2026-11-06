import {compileForgeryscopeScientificScope} from './unified-engine/src/forgeryscope-scientific-scope.js';

const check=signal=>signal?.throwIfAborted();
const invalid=message=>Object.assign(Error(message),{code:'BATCH_SCOPE_INVALID'});
const eps=1e-9;
function union(intervals){
 intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const merged=[];
 for(const interval of intervals){const previous=merged.at(-1);if(previous&&interval[0]<=previous[1]+1)previous[1]=Math.max(previous[1],interval[1]);else merged.push(interval.slice());}return merged;
}
function intervalsAt({polygon,bounds},y,width){
 if(y<bounds[1]||y>bounds[3])return [];
 const crossings=[],intervals=[];
 const include=(left,right)=>{const a=Math.max(0,Math.ceil(Math.max(left,bounds[0]))),b=Math.min(width-1,Math.floor(Math.min(right,bounds[2])));if(b>=a)intervals.push([a,b]);};
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [ax,ay]=polygon[j],[bx,by]=polygon[i];
  if((ay>y)!==(by>y))crossings.push(ax+(y-ay)*(bx-ax)/(by-ay));
  if(ay===by){if(Math.abs((y-ay)*(bx-ax))<=eps)include(Math.min(ax,bx),Math.max(ax,bx));}
  else if(y>=Math.min(ay,by)&&y<=Math.max(ay,by)){
   const x=ax+(y-ay)*(bx-ax)/(by-ay),rounded=Math.round(x);
   // Text boundary pixels are excluded, matching the point-scope predicate.
   if(Math.abs((rounded-ax)*(by-ay)-(y-ay)*(bx-ax))<=eps)include(rounded,rounded);
  }
 }
 crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)include(crossings[i],crossings[i+1]);return intervals;
}
function rowEvents(polygons,top,rows,height){
 const active=new Set(),starts=new Map(),ends=new Map(),last=top+rows-1;
 for(const polygon of polygons){const first=Math.max(0,Math.ceil(polygon.bounds[1])),end=Math.min(height-1,Math.floor(polygon.bounds[3]));if(end<top||first>last)continue;
  if(first<=top)active.add(polygon);else{if(!starts.has(first))starts.set(first,[]);starts.get(first).push(polygon);}
  if(end<last){if(!ends.has(end+1))ends.set(end+1,[]);ends.get(end+1).push(polygon);}
 }
 return {active,starts,ends};
}
/** Rasterize polygon unions once per scanline, then subtract their exclusions.
 * No source-sized bitmap or per-pixel walk over every text box is retained.
 * Integer samples use original pixel coordinates; exclusion edges are closed.
 */
export function createBatchScopeMask(scope,{width,height,sourceSha256}={}){
 let compiled;try{compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256});}catch(error){throw Object.assign(invalid(error.message),{cause:error});}if(!compiled)return null;
 const policy={schema:compiled.schema,fingerprint:compiled.fingerprint,sourceSha256:compiled.sourceSha256,width,height,coordinates:'original-pixels',stage:'derived-evidence-only',originalPixelsPreserved:true,rawScientificOutputsPreserved:true,predicate:'acquisition polygon union minus closed exclusion polygons',models:scope.models??null};
 function window(top,rows,signal){if(!Number.isSafeInteger(top)||!Number.isSafeInteger(rows)||top<0||rows<1||top+rows>height||!Number.isSafeInteger(width*rows))throw invalid('Invalid scientific scope row window.');check(signal);}
 function scanRows(top,rows,consume,signal){
  const allowed=rowEvents(compiled.regions,top,rows,height),excluded=rowEvents(compiled.excluded,top,rows,height);
  for(let row=0;row<rows;row++){
   check(signal);const y=top+row;for(const events of [allowed,excluded]){for(const polygon of events.ends.get(y)??[])events.active.delete(polygon);for(const polygon of events.starts.get(y)??[])events.active.add(polygon);}
   consume(row,union([...allowed.active].flatMap(polygon=>intervalsAt(polygon,y,width))),union([...excluded.active].flatMap(polygon=>intervalsAt(polygon,y,width))));
  }
 }
 return {
  policy,compiled,
  readRows(top,rows,{budget,signal}={}){
   window(top,rows,signal);
   const release=budget?.reserve(width*rows)??(()=>{});let complete=false;
   try{
    const data=new Uint8Array(width*rows);scanRows(top,rows,(row,allowed,excluded)=>{const offset=row*width;for(const [left,right]of allowed)data.fill(1,offset+left,offset+right+1);for(const [left,right]of excluded)data.fill(0,offset+left,offset+right+1);},signal);
    complete=true;return {data,width,height:rows,top,release};
   }finally{if(!complete)release();}
  },
  // The destination must be derived/borrowed output, never a raw model array.
  // Corroboration can be filtered in place without an additional dense mask.
  filterRows(destination,top,rows,{signal}={}){
   window(top,rows,signal);if(!ArrayBuffer.isView(destination)||destination.length!==width*rows||typeof destination.fill!=='function')throw invalid('Invalid derived evidence row destination.');
   scanRows(top,rows,(row,allowed,excluded)=>{const offset=row*width;let cursor=0;for(const [left,right]of allowed){destination.fill(0,offset+cursor,offset+left);cursor=right+1;}destination.fill(0,offset+cursor,offset+width);for(const [left,right]of excluded)destination.fill(0,offset+left,offset+right+1);},signal);return destination;
  }
 };
}

export function scopedMaskStore(raw,scope,{width,height,budget,signal}={}){
 if(!scope)return raw;
 if(raw?.byteLength!==width*height||typeof raw.readInto!=='function')throw invalid('Scientific mask dimensions differ from the original.');
 return {byteLength:raw.byteLength,async readInto(destination,offset){
  check(signal);if(!(destination instanceof Uint8Array)||!Number.isSafeInteger(offset)||offset<0||offset+destination.length>raw.byteLength)throw invalid('Invalid scientific mask window.');
  const value=await raw.readInto(destination,offset);if(value&&value!==destination)destination.set(value);if(!destination.length)return destination;
  const top=Math.floor(offset/width),rows=Math.ceil((offset%width+destination.length)/width),eligible=scope.readRows(top,rows,{budget,signal});
  try{const start=offset-top*width;for(let i=0;i<destination.length;i++)if(!eligible.data[start+i])destination[i]=0;return destination;}finally{eligible.release();}
 }};
}
