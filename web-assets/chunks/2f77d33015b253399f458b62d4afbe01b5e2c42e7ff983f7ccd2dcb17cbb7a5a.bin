import "../../runtime-context.js?v=0.24.0";
export const ORIGINAL_SOURCE_REGIONS_SCHEMA='sherloq.source-regions/1';
const copy=value=>structuredClone(value),hash=/^[a-f0-9]{64}$/,MAX_ZONES=8192,MAX_VERTICES=131072;
const failure=message=>Object.assign(new TypeError(message),{code:'SOURCE_REGIONS_INVALID'});
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const rectangle=r=>[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];
const bounds=polygon=>({x0:Math.min(...polygon.map(p=>p[0])),y0:Math.min(...polygon.map(p=>p[1])),x1:Math.max(...polygon.map(p=>p[0])),y1:Math.max(...polygon.map(p=>p[1]))});
function dimensions(source){if(!source||!hash.test(source.sourceSha256??'')||![source.width,source.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=131072))throw failure('Original source dimensions and SHA-256 are required.');return{sourceSha256:source.sourceSha256,width:source.width,height:source.height};}
function geometry(value,size){
 const box=Array.isArray(value?.bounds)?{x0:value.bounds[0],y0:value.bounds[1],x1:value.bounds[2],y1:value.bounds[3]}:value;
 if(!box||![box.x0,box.y0,box.x1,box.y1].every(Number.isFinite)||box.x0<0||box.y0<0||box.x1>size.width||box.y1>size.height||box.x1<=box.x0||box.y1<=box.y0)throw failure('Region bounds must remain in the original image.');
 const polygon=copy(value.polygon??rectangle(box));if(!Array.isArray(polygon)||polygon.length<3||polygon.length>8192||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>size.width||p[1]>size.height))throw failure('Invalid source-region polygon.');
 const b=bounds(polygon),area=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0);if(Math.abs(area)<1e-10||['x0','y0','x1','y1'].some(key=>Math.abs(b[key]-box[key])>1e-7))throw failure('Region polygon and bounds differ.');
 return{...b,polygon};
}
function normalize(value,source){
 const size=dimensions(source??value);if(value?.schema!==ORIGINAL_SOURCE_REGIONS_SCHEMA||value.sourceSha256!==size.sourceSha256||value.width!==size.width||value.height!==size.height||typeof value.enabled!=='boolean'||!['whole','selected'].includes(value.positiveMode)||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.zones)||value.zones.length>MAX_ZONES)throw failure('Invalid source-region snapshot or source identity.');
 const ids=new Set();let vertices=0;
 const zones=value.zones.map(zone=>{if(!zone||typeof zone.id!=='string'||!zone.id||zone.id.length>256||ids.has(zone.id)||!['acquisition','exclusion'].includes(zone.kind)||typeof zone.enabled!=='boolean')throw failure('Each source region needs a stable ID, role and enabled state.');ids.add(zone.id);const current=geometry(zone,size),originalGeometry=geometry(zone.originalGeometry??zone,size);vertices+=current.polygon.length+originalGeometry.polygon.length;if(vertices>MAX_VERTICES)throw failure('Source regions contain too many vertices.');return{id:zone.id,kind:zone.kind,enabled:zone.enabled,...current,originalGeometry,...(typeof zone.role==='string'?{role:zone.role}:{}),...(typeof zone.label==='string'?{label:zone.label}:{}),...(typeof zone.origin==='string'?{origin:zone.origin}:{})};});
 return{schema:ORIGINAL_SOURCE_REGIONS_SCHEMA,...size,revision:value.revision,enabled:value.enabled,positiveMode:value.positiveMode,zones};
}
async function identity(value){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function signed(value,source){const next=normalize(value,source),{revision,...semantic}=next;return freeze({...next,fingerprint:await identity(semantic)});}
export async function validateOriginalSourceRegions(value,source){const result=await signed(value,source);if(value.fingerprint!==undefined&&value.fingerprint!==result.fingerprint)throw failure('Source-region fingerprint does not match its geometry.');return result;}

/** Immutable snapshots and serialized commands. Undo restores state, not an old revision number. */
export async function createOriginalSourceRegionsState(source,{snapshot,historyLimit=100}={}){
 const size=dimensions(source);if(!Number.isSafeInteger(historyLimit)||historyLimit<1||historyLimit>1000)throw failure('Invalid source-region history limit.');
 let current=await(snapshot?validateOriginalSourceRegions(snapshot,size):signed({schema:ORIGINAL_SOURCE_REGIONS_SCHEMA,...size,revision:0,enabled:false,positiveMode:'whole',zones:[]},size)),past=[],future=[],queue=Promise.resolve();
 const transact=change=>{const work=queue.then(async()=>{const previous=current,draft=copy(previous);await change(draft);draft.revision=previous.revision+1;const next=await signed(draft,size);if(next.fingerprint===previous.fingerprint)return current;past.push(previous);if(past.length>historyLimit)past.shift();future=[];current=next;return current;});queue=work.catch(()=>{});return work;};
 const find=(draft,id)=>{const value=draft.zones.find(zone=>zone.id===id);if(!value)throw failure('The source region is absent.');return value;};
 const history=undo=>{const work=queue.then(async()=>{const from=undo?past:future,to=undo?future:past;if(!from.length)return current;const restored=from.at(-1),next=await signed({...restored,revision:current.revision+1},size);from.pop();to.push(current);current=next;return current;});queue=work.catch(()=>{});return work;};
 return{
  snapshot:()=>current,serialize:()=>copy(current),get ready(){return queue;},get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},
  toggle(value){return transact(draft=>{if(value!==undefined&&typeof value!=='boolean')throw failure('A scope enabled state must be boolean.');draft.enabled=value===undefined?!draft.enabled:value;});},
  clear(){return transact(draft=>{draft.zones=[];});},
  add(kind,shape,{id='source-zone-'+crypto.randomUUID(),enabled=true,role,origin='human'}={}){return transact(draft=>{if(!['acquisition','exclusion'].includes(kind)||typeof enabled!=='boolean')throw failure('Invalid new source-region role.');const g=geometry(shape,size);draft.zones.push({id,kind,enabled,...g,originalGeometry:copy(g),origin,...(role?{role}:{})});draft.enabled=true;if(kind==='acquisition')draft.positiveMode='selected';});},
  update(id,shape,{operation='resize'}={}){return transact(draft=>{const zone=find(draft,id);let g;if(operation==='move'){const b=shape?.bounds??[shape?.x0,shape?.y0,shape?.x1,shape?.y1];if(!b.every(Number.isFinite))throw failure('Invalid source-region move.');const dx=Math.max(-zone.x0,Math.min(size.width-zone.x1,b[0]-zone.x0)),dy=Math.max(-zone.y0,Math.min(size.height-zone.y1,b[1]-zone.y0));g=geometry({...zone,x0:zone.x0+dx,y0:zone.y0+dy,x1:zone.x1+dx,y1:zone.y1+dy,polygon:zone.polygon.map(([x,y])=>[x+dx,y+dy])},size);}else g=geometry(shape,size);Object.assign(zone,g,{origin:'human'});});},
  restoreGeometry(id){return transact(draft=>Object.assign(find(draft,id),copy(find(draft,id).originalGeometry),{origin:'human'}));},
  remove(id){return transact(draft=>{find(draft,id);draft.zones=draft.zones.filter(zone=>zone.id!==id);});},
  setZoneEnabled(id,enabled){return transact(draft=>{if(typeof enabled!=='boolean')throw failure('A region enabled state must be boolean.');find(draft,id).enabled=enabled;});},
  replaceZones(zones,{positiveMode='selected',enabled=true}={}){return transact(draft=>{draft.zones=copy(zones).map(zone=>({...zone,enabled:zone.enabled??true,originalGeometry:copy(zone.originalGeometry??geometry(zone,size))}));draft.positiveMode=positiveMode;draft.enabled=enabled;});},
  restore(value){return transact(async draft=>Object.assign(draft,copy(await validateOriginalSourceRegions(value,size))));},
  undo:()=>history(true),redo:()=>history(false)
 };
}

function union(intervals){const result=[];for(const [a,b]of intervals.filter(([a,b])=>b>a).sort((x,y)=>x[0]-y[0]||x[1]-y[1])){const last=result.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else result.push([a,b]);}return result;}
function intersect(a,b){const out=[];for(let i=0,j=0;i<a.length&&j<b.length;){const lo=Math.max(a[i][0],b[j][0]),hi=Math.min(a[i][1],b[j][1]);if(hi>lo)out.push([lo,hi]);if(a[i][1]<b[j][1])i++;else j++;}return out;}
function subtract(a,b){const out=[];for(const [lo,hi]of a){let cursor=lo;for(const [x,y]of b){if(y<=cursor)continue;if(x>=hi)break;if(x>cursor)out.push([cursor,Math.min(x,hi)]);cursor=Math.max(cursor,y);if(cursor>=hi)break;}if(cursor<hi)out.push([cursor,hi]);}return out;}
function inside(polygon,x,y){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i],cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);if(Math.abs(cross)<1e-8&&x>=Math.min(a[0],b[0])-1e-8&&x<=Math.max(a[0],b[0])+1e-8&&y>=Math.min(a[1],b[1])-1e-8&&y<=Math.max(a[1],b[1])+1e-8)return true;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
function polygonRow(polygon,y,width){
 const line=y+.5,crossings=[],segments=[];for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if(Math.abs(a[1]-line)<1e-9&&Math.abs(b[1]-line)<1e-9)segments.push([Math.min(a[0],b[0]),Math.max(a[0],b[0])]);if((a[1]>line)!==(b[1]>line))crossings.push(a[0]+(line-a[1])*(b[0]-a[0])/(b[1]-a[1]));if(Math.abs(a[1]-line)<1e-9)segments.push([a[0],a[0]]);}
 crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2)segments.push([crossings[i],crossings[i+1]]);
 return union(segments.map(([a,b])=>[Math.max(0,Math.ceil(a-.5-1e-9)),Math.min(width,Math.floor(b-.5+1e-9)+1)]));
}

/** Native pixel membership; excluded boundaries win. No black pixels are synthesized. */
export async function compileOriginalSourceRegions(input,{ceiling=null}={}){
 if(input?.schema==='sherloq.source-region-domain/1'&&input.snapshot){if(ceiling)throw failure('A transported domain already specifies its immutable ceiling.');const restored=await compileOriginalSourceRegions(input.snapshot,{ceiling:input.ceiling});if(input.fingerprint!==restored.fingerprint)throw failure('Transported source-region domain identity differs.');return restored;}
 const snapshot=await validateOriginalSourceRegions(input),size=dimensions(snapshot),parent=ceiling?(typeof ceiling.originalRowIntervals==='function'?ceiling:await compileOriginalSourceRegions(ceiling)):null;
 if(parent&&(parent.sourceSha256!==size.sourceSha256||parent.sourceWidth!==size.width||parent.sourceHeight!==size.height||!hash.test(parent.fingerprint??'')||typeof parent.originalRowIntervals!=='function'||typeof parent.containsPointOriginal!=='function'))throw failure('Inherited regions belong to another source or are not a compiled domain.');
 const positives=!snapshot.enabled||snapshot.positiveMode==='whole'?[rectangle({x0:0,y0:0,x1:size.width,y1:size.height})]:snapshot.zones.filter(z=>z.enabled&&z.kind==='acquisition').map(z=>z.polygon);
 const exclusions=snapshot.enabled?snapshot.zones.filter(z=>z.enabled&&z.kind==='exclusion').map(z=>z.polygon):[];
 let rect=null;for(const polygon of positives)for(const [x,y]of polygon){if(!rect)rect={x0:x,y0:y,x1:x,y1:y};else{rect.x0=Math.min(rect.x0,x);rect.y0=Math.min(rect.y0,y);rect.x1=Math.max(rect.x1,x);rect.y1=Math.max(rect.y1,y);}}if(rect)rect={x0:Math.floor(rect.x0),y0:Math.floor(rect.y0),x1:Math.ceil(rect.x1),y1:Math.ceil(rect.y1)};
 if(parent){if(!parent.rect)rect=null;else if(rect)rect={x0:Math.max(rect.x0,parent.rect.x0),y0:Math.max(rect.y0,parent.rect.y0),x1:Math.min(rect.x1,parent.rect.x1),y1:Math.min(rect.y1,parent.rect.y1)};}
 if(rect&&(rect.x1<=rect.x0||rect.y1<=rect.y0))rect=null;
 const originalRows=y=>{if(!Number.isInteger(y)||y<0||y>=size.height)return[];let rows=union(positives.flatMap(p=>polygonRow(p,y,size.width)));rows=subtract(rows,union(exclusions.flatMap(p=>polygonRow(p,y,size.width))));if(parent)rows=intersect(rows,parent.originalRowIntervals(y));return rows;};
 let countIncluded=0;if(rect)for(let y=rect.y0;y<rect.y1;y++)for(const [a,b]of originalRows(y))countIncluded+=Math.max(0,Math.min(b,rect.x1)-Math.max(a,rect.x0));
 if(!countIncluded)rect=null;const origin=rect?[rect.x0,rect.y0]:[0,0],width=rect?rect.x1-rect.x0:0,height=rect?rect.y1-rect.y0:0;
 const fingerprint=await identity([ORIGINAL_SOURCE_REGIONS_SCHEMA,'domain-1',snapshot.fingerprint,parent?.fingerprint??null,rect]);
 const containsPointOriginal=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<size.width&&y<size.height&&positives.some(p=>inside(p,x,y))&&!exclusions.some(p=>inside(p,x,y))&&(!parent||parent.containsPointOriginal(x,y));
 const containsOriginal=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&containsPointOriginal(x+.5,y+.5);
 const descriptor=freeze({schema:'sherloq.source-region-domain/1',snapshot,ceiling:parent?.descriptor??null,fingerprint,rect:rect?{...rect}:null,origin:[...origin],width,height,countIncluded});
 return Object.freeze({schema:'sherloq.source-region-domain/1',sourceSha256:size.sourceSha256,sourceWidth:size.width,sourceHeight:size.height,sourceRevision:snapshot.revision,sourceFingerprint:snapshot.fingerprint,parentFingerprint:parent?.fingerprint??null,fingerprint,rect:rect?freeze({...rect}):null,origin:freeze(origin),width,height,countIncluded,empty:countIncluded===0,containsPointOriginal,containsOriginal,contains:(x,y)=>x>=0&&y>=0&&x<width&&y<height&&containsOriginal(x+origin[0],y+origin[1]),originalRowIntervals:originalRows,rowIntervals(y){if(!Number.isInteger(y)||y<0||y>=height)return[];return intersect(originalRows(y+origin[1]),[[origin[0],origin[0]+width]]).map(([a,b])=>[a-origin[0],b-origin[0]]);},toOriginal:([x,y])=>[x+origin[0],y+origin[1]],toLocal:([x,y])=>[x-origin[0],y-origin[1]],snapshot,descriptor});
}
