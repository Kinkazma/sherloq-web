import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// This is a provisional lattice, not a compiled Original scientific domain.
// A missing cell never supplies RGB to visitIncluded/readWindow. The separate
// display reader is used only after statistics/selection for presentation.
export async function createNoisesnifferProxySource(original,domain,step,{budget,signal}={}){
 const nativeSurface=original?.surface,descriptor=nativeSurface?.descriptor,nativeRevision=descriptor?.revision;
 requireValue(descriptor?.format==='rgb8'&&typeof descriptor.id==='string'&&Number.isSafeInteger(descriptor.revision)&&original.sha256===domain.sourceSha256&&descriptor.width===domain.sourceWidth&&descriptor.height===domain.sourceHeight,'Noisesniffer proxy source identity differs.');
 requireValue(Number.isSafeInteger(step)&&step>0&&step<=Math.max(domain.width,domain.height),'Invalid provisional lattice step.');
 const width=Math.ceil(domain.width/step),height=Math.ceil(domain.height/step),n=width*height;
 requireValue(n>0&&n<=2048**2,'Provisional lattice is outside its finite admission.');
 const bytes=n*24+height*32+4096,credit=budget.reserve(bytes),membership=new Uint8Array(n),rows=[];
 const pending=new Set(),reads=new Set(),cooperate=createCooperator(signal);let closed=false,retiring,retired=false,count=0,retained=false;
 function includesNative(rect){for(let y=rect.y;y<rect.y+rect.height;y++){const spans=domain.rowIntervals(y);if(!spans.some(([a,b])=>a<=rect.x&&b>=rect.x+rect.width))return false;}return true;}
 const alive=extra=>{checkAbort(extra);if(closed)throw new EngineError('DISPOSED','Provisional lattice retired.');if(original.surface!==nativeSurface||nativeSurface.descriptor.revision!==nativeRevision||original.sha256!==domain.sourceSha256)throw new EngineError('SOURCE_CHANGED','Provisional Original owner changed.');};
 function rectangle(rect){requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'Invalid provisional source window.');return rect;}
 function includes(rect){for(let y=rect.y;y<rect.y+rect.height;y++)if(!rows[y].some(([a,b])=>a<=rect.x&&b>=rect.x+rect.width))return false;return true;}
 async function copiedRow(x,y,w,destination,{signal:extra,scientific}={}){
  alive(extra);if(scientific)requireValue(includes({x,y,width:w,height:1}),'Forbidden proxy observations cannot enter native statistics.');
  const native={x:domain.origin[0]+x*step,y:domain.origin[1]+y*step,width:(w-1)*step+1,height:1},window=await original.surface.readWindow(native,{signal:extra});
  const held={window,async retire(){await window.release?.();pending.delete(held);}};pending.add(held);let primary;
  try{alive(extra);requireValue(window.pixels?.format==='rgb8'&&window.pixels.width===native.width&&window.pixels.height===1&&window.pixels.data instanceof Uint8Array&&window.pixels.data.length===native.width*3,'Original returned another provisional RGB window.');for(let i=0;i<w;i++)destination.set(window.pixels.data.subarray(i*step*3,i*step*3+3),i*3);}
  catch(error){primary=error;throw error;}finally{await retireCompositeOwners([()=>held.retire()],primary?{primary}:{});}
 }
 async function readWindow(rect,{signal:extra,scientific=false}={}){
  alive(extra);rectangle(rect);if(scientific&&!includes(rect))throw new EngineError('SOURCE_REGION_PARTIAL_WINDOW','The provisional kernel needs wholly admitted cells.');
  const release=budget.reserve(rect.width*rect.height*3);let committed=false,finish;const completed=new Promise(resolve=>finish=resolve);reads.add(completed);
  try{const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++){checkAbort(extra);await copiedRow(rect.x,rect.y+y,rect.width,data.subarray(y*rect.width*3,(y+1)*rect.width*3),{signal:extra,scientific});}alive(extra);committed=true;let released=false;return{pixels:{width:rect.width,height:rect.height,format:'rgb8',data},release(){if(!released){released=true;release();}}};}finally{if(!committed)release();reads.delete(completed);finish();}
 }
 try{
  for(let y=0;y<height;y++){await cooperate();const row=[];let start=-1;for(let x=0;x<width;x++){const rect={x:x*step,y:y*step,width:Math.min(step,domain.width-x*step),height:Math.min(step,domain.height-y*step)},on=includesNative(rect);if(on){membership[y*width+x]=1;count++;if(start<0)start=x;}else if(start>=0){row.push(Object.freeze([start,x]));start=-1;}}if(start>=0)row.push(Object.freeze([start,width]));rows.push(Object.freeze(row));}
  checkAbort(signal);const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['noisesniffer-provisional-lattice/1',domain.sourceSha256,domain.fingerprint,descriptor.id,descriptor.revision,step,width,height,rows]))))].map(v=>v.toString(16).padStart(2,'0')).join('');checkAbort(signal);
  const proxyDomain=Object.freeze({schema:'sherloq.noisesniffer-provisional-lattice/1',width,height,countIncluded:count,sourceWidth:width,sourceHeight:height,sourceSha256:domain.sourceSha256,origin:Object.freeze([0,0]),fingerprint,rowIntervals:y=>rows[y]??[],contains:(x,y)=>x>=0&&y>=0&&x<width&&y<height&&membership[y*width+x]===1});
  const view={includesRectangle:rect=>{alive();return includes(rectangle(rect));},readWindow:(rect,options)=>readWindow(rect,{...options,scientific:true}),async visitIncluded(visitor,{signal:extra,windowPixels=65536}={}){for(let y=0;y<height;y++)for(const[a,b]of rows[y])for(let x=a;x<b;x+=windowPixels){const rect={x,y,width:Math.min(windowPixels,b-x),height:1},part=await readWindow(rect,{signal:extra,scientific:true});try{await visitor(part.pixels,{rect});}finally{part.release();}}}};
  const surface={descriptor:Object.freeze({id:'noise-proxy-'+crypto.randomUUID(),revision:1,width,height,format:'rgb8'}),readWindow};
  credit();budget.retain(bytes);retained=true;
  return{domain:proxyDomain,view,image:{surface,readScientificPatch:(rect,options)=>view.readWindow(rect,options)},metadata:Object.freeze({schema:proxyDomain.schema,step,width,height,selectedCells:count,cellAdmission:'all-native-pixel-centres-in-cell',sample:'native-top-left-pixel-centre',sourceRegionFingerprint:domain.fingerprint,latticeFingerprint:fingerprint,nativeOrigin:Object.freeze([...domain.origin])}),dispose(){if(retired)return Promise.resolve();if(retiring)return retiring;closed=true;return retiring=(async()=>{await Promise.all(reads);await retireCompositeOwners([...pending].map(entry=>()=>entry.retire()));budget.retained-=bytes;retired=true;})().finally(()=>{retiring=null;});}};
 }catch(error){if(retained)budget.retained-=bytes;else credit();throw error;}
}
