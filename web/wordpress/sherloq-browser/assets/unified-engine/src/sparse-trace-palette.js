import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort} from './errors.js';

const POOL_SIZE=1;
const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]||a[3]-b[3];
export function nativeTraceLinkKey(first,second){const a=[first.x,first.y],b=[second.x,second.y];return a[0]<b[0]||a[0]===b[0]&&a[1]<=b[1]?[...a,...b]:[...b,...a];}
const gcd=(a,b)=>{while(b){const n=a%b;a=b;b=n;}return a;};
const ceilDiv=(a,b)=>Math.ceil(a/b);
// Integer RGB enumerator: no HSV conversion/rounding and no duplicate sextant
// boundaries. Every candidate is assigned to exactly one hue family.
export function traceHueFamily(sector,count){
 requireValue(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(sector)&&sector>=0&&sector<count,'Invalid trace colour family.');
 let capacity=0,countSegments=0;
 const scan=visitor=>{for(let chroma=80;chroma<=255;chroma++)for(let sextant=0;sextant<6;sextant++){const z0=Math.max(0,ceilDiv((6*sector-sextant*count)*chroma,count)),z1=Math.min(chroma,ceilDiv((6*(sector+1)-sextant*count)*chroma,count)),m0=Math.max(0,128-chroma),mCount=256-chroma-m0;if(z1>z0)visitor(chroma,sextant,z0,z1-z0,m0,mCount);}};
 scan((c,s,z,n,m,k)=>{capacity+=n*k;countSegments++;});
 const segments=new Uint32Array(countSegments*7);let segment=0,start=0;
 scan((c,s,z,n,m,k)=>{const end=start+n*k;segments.set([start,end,c,s,z,n,m],segment++*7);start=end;});
 let step=Math.max(1,Math.floor(capacity*.618033988749895));while(gcd(step,capacity)!==1)step++;let cursor=0;
 const at=index=>{requireValue(Number.isSafeInteger(index)&&index>=0&&index<capacity,'Trace colour capacity exceeded.');let lo=0,hi=countSegments-1;while(lo<hi){const mid=(lo+hi)>>1;if(index<segments[mid*7+1])hi=mid;else lo=mid+1;}const at=lo*7,q=index-segments[at],c=segments[at+2],sextant=segments[at+3],zCount=segments[at+5],m=segments[at+6]+Math.floor(q/zCount),z=segments[at+4]+q%zCount;switch(sextant){case 0:return[m+c,m+z,m];case 1:return[m+c-z,m+c,m];case 2:return[m,m+c,m+z];case 3:return[m,m+c-z,m+c];case 4:return[m+z,m,m+c];default:return[m+c,m,m+c-z];}};
 return{sector,count,capacity,get remaining(){return capacity-cursor;},segmentCount:countSegments,storageBytes:segments.byteLength,at,next(){requireValue(cursor<capacity,'The native trace hue family has no unused RGB24 colour.');return at((cursor++*step)%capacity);}};
}
// Only one ring table is materialised per palette call. Family states hold
// scalar cursors, never this scratch array or a reader retaining it.
function hueRing(sector,count,padding,table){
 const denominator=255*count,full=6*denominator,ranges=[],wrap=(a,b)=>{const start=((a%full)+full)%full,end=start+b-a;if(end<=full)ranges.push([start,end]);else ranges.push([start,full],[0,end-full]);};
 wrap(6*sector*255-padding*count,6*sector*255-(padding-1)*count);wrap(6*(sector+1)*255+(padding-1)*count,6*(sector+1)*255+padding*count);
 let capacity=0,segments=0;
 for(let c=80;c<=255;c++)for(let sextant=0;sextant<6;sextant++)for(const [lo,hi]of ranges){const z0=Math.max(0,ceilDiv((lo-sextant*denominator)*c,denominator)),z1=Math.min(c,ceilDiv((hi-sextant*denominator)*c,denominator));if(z1<=z0)continue;const m0=Math.max(0,128-c),end=capacity+(z1-z0)*(256-c-m0);requireValue((segments+1)*7<=table.length,'Trace hue ring exceeds admitted scratch.');table.set([capacity,end,c,sextant,z0,z1-z0,m0],segments++*7);capacity=end;}
 return{capacity,at(index){requireValue(index>=0&&index<capacity,'Invalid trace ring index.');let lo=0,hi=segments-1;while(lo<hi){const mid=(lo+hi)>>1;if(index<table[mid*7+1])hi=mid;else lo=mid+1;}const at=lo*7,q=index-table[at],c=table[at+2],sextant=table[at+3],n=table[at+5],m=table[at+6]+Math.floor(q/n),z=table[at+4]+q%n;switch(sextant){case 0:return[m+c,m+z,m];case 1:return[m+c-z,m+c,m];case 2:return[m,m+c,m+z];case 3:return[m,m+c-z,m+c];case 4:return[m+z,m,m+c];default:return[m+c,m,m+c-z];}}};
}
const rgb24=c=>(c[0]<<16)|(c[1]<<8)|c[2];
export function tracePaletteWorkingBytes(groups,allRows=0){requireValue(Number.isSafeInteger(groups)&&groups>=0&&Number.isSafeInteger(allRows)&&allRows>=0,'Invalid trace palette admission.');if(!groups)return 0;let segments=0;for(let c=80;c<=255;c++)segments+=Math.min(6*c,groups+5);return segments*28+groups*4096+96*(allRows+POOL_SIZE*groups)+131072;}
/** Called only inside selectSparseTraceRows's conservative shared admission.
 * Complete native groups are the colour authority; visibility never enters it.
 * Direct deterministic coprime enumeration within each integer hue family.
 * No maximin, perceptual optimisation or colour-spacing optimum is claimed.
 */
export async function buildSparseTracePalette(result,endpoints,{cooperate,signal}={}){
 checkAbort(signal);requireValue(typeof cooperate==='function','Admitted trace palette cooperator required.');const started=performance.now(),nativeGroups=result.groups,groups=[],links=new Map(),byRow=new Map();
 for(let index=0;index<nativeGroups.length;index++){const rows=nativeGroups[index];if(!rows.length)continue;const group={index,rank:groups.length,owned:[],capacity:0};groups.push(group);for(const row of rows){await cooperate();const c=endpoints.get(row);requireValue(c,'Native trace colour geometry is missing.');const geometry=nativeTraceLinkKey(c.first,c.second),key=geometry.join(',');let link=links.get(key);if(!link){link={key,geometry,owner:group,rows:new Set(),rgb:null,lab:null};links.set(key,link);group.owned.push(link);}link.rows.add(row);byRow.set(row,link);}}
 const claims=new Map();let assignedColors=0,scratch=null,ringCache=null;
 const ordered=[...links.values()].sort((a,b)=>cmp(a.geometry,b.geometry)),G=groups.length;let sectorStep=Math.max(1,Math.floor(G*.618033988749895));while(gcd(sectorStep,G)!==1)sectorStep++;
 const nextAvailable=async group=>{for(;;){await cooperate();let rgb,padding=0;if(group.family.remaining)rgb=group.family.next();else{if(!scratch)scratch=new Uint32Array(4224*7);if(!group.ring||group.ring.cursor>=group.ring.capacity){const next=(group.ring?.padding??0)+1;requireValue(next<=765,'The admitted readable RGB trace palette is exhausted.');if(!ringCache||ringCache.group!==group.rank||ringCache.padding!==next)ringCache={group:group.rank,padding:next,reader:hueRing(group.sector,G,next,scratch)};group.ring={padding:next,cursor:0,capacity:ringCache.reader.capacity};if(!group.ring.capacity)continue;}if(!ringCache||ringCache.group!==group.rank||ringCache.padding!==group.ring.padding)ringCache={group:group.rank,padding:group.ring.padding,reader:hueRing(group.sector,G,group.ring.padding,scratch)};padding=group.ring.padding;rgb=ringCache.reader.at(group.ring.cursor++);group.maximumAllocatedPadding=Math.max(group.maximumAllocatedPadding,padding);}const code=rgb24(rgb);if(claims.has(code))continue;claims.set(code,group.rank);return{rgb,padding};}};
 for(const group of groups){await cooperate();const sector=group.rank*sectorStep%G,family=traceHueFamily(sector,G);group.family=family;group.sector=sector;group.capacity=family.capacity;group.maximumAllocatedPadding=0;group.maximumUsedPadding=0;group.outsideNominal=0;const length=group.owned.length?Math.min(POOL_SIZE,Math.max(group.owned.length>family.capacity?group.owned.length:family.capacity,1)):0;group.pool={codes:new Uint32Array(length),padding:new Uint16Array(length),length};for(let i=0;i<length;i++){const next=await nextAvailable(group);group.pool.codes[i]=rgb24(next.rgb);group.pool.padding[i]=next.padding;}group.used=0;}

 for(const link of ordered){await cooperate();const pool=link.owner.pool,code=pool.codes[0];link.rgb=[code>>>16,(code>>>8)&255,code&255];requireValue(claims.get(code)===link.owner.rank,'Trace RGB24 injectivity failed.');claims.set(code,-link.owner.rank-1);assignedColors++;link.owner.used++;if(pool.padding[0]){link.owner.outsideNominal++;link.owner.maximumUsedPadding=Math.max(link.owner.maximumUsedPadding,pool.padding[0]);}
  if(link.owner.family.remaining||link.owner.used<link.owner.owned.length){const next=await nextAvailable(link.owner);pool.codes[0]=rgb24(next.rgb);pool.padding[0]=next.padding;}else pool.length=0;
 }
 const colors=new Uint8Array(result.colors);for(const link of ordered)for(const row of link.rows){await cooperate();colors.set([link.rgb[2],link.rgb[1],link.rgb[0]],row*3);}checkAbort(signal);
 return{colors,byRow,metadata:{policy:'native-group-hue-families-injective-rgb24/1',completeNativeGroups:G,uniqueGeometricLinks:links.size,colouredNativeRows:byRow.size,uniqueRGB24:assignedColors,collisions:links.size-assignedColors,registryEntries:claims.size,registryAssigned:assignedColors,registryReserved:claims.size-assignedColors,ringScratchBytes:scratch?.byteLength??0,familyOwner:'lowest-full-native-group-index',minimumValue:128,minimumChroma:80,poolSize:POOL_SIZE,maximumPreviousNeighbours:0,dispersion:'direct deterministic coprime integer RGB family stream; no perceptual optimum claimed',packedSegmentBytes:groups.reduce((n,g)=>n+g.family.storageBytes,0),packedPoolBytes:groups.reduce((n,g)=>n+g.pool.codes.byteLength+g.pool.padding.byteLength,0),families:groups.map(g=>({nativeIndex:g.index,sector:g.sector,hueDegrees:[g.sector*360/G,(g.sector+1)*360/G],ownedUniqueLinks:g.owned.length,capacity:g.capacity,maximumAllocatedPaddingDegrees:g.maximumAllocatedPadding*60/255,maximumUsedPaddingDegrees:g.maximumUsedPadding*60/255,outsideNominalLinks:g.outsideNominal})),milliseconds:performance.now()-started}};
}
