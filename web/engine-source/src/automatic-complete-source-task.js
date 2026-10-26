import {sourceRegionTransportBytes} from './source-region-transport.js';
import {requireValue,checkAbort} from './errors.js';
const poly=r=>[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(v=>v.toString(16).padStart(2,'0')).join('');
/** Inherit actual Original acquisitions before native-grid localization. This
 * is geometry only and explicitly leaves native OCR pending. It never invents
 * an OCR result, a classification, a new acquisition or a whole-frame fallback
 * after an explicitly empty/disabled selection. */
export async function automaticCompleteSourceTask(task,domain,{budget,signal}={}){
 requireValue(task?.operation==='analysis.complete'&&domain?.descriptor&&budget?.reserve,'Verified complete Original source domain required.');
 checkAbort(signal);if(task.params?.scientificScope||task.scientificScope)return{task,release(){}};
 const free=budget.reserve(65536+sourceRegionTransportBytes([task,domain.descriptor],{allowAliases:true,allowUndefined:true})*8);let returned=false;
 try{
  checkAbort(signal);const out=structuredClone(task),snapshot=domain.descriptor.snapshot;let selection=out.params?.selection,regions,search,excluded;
  const region=(polygon,index,extra={})=>{requireValue(Array.isArray(polygon)&&polygon.length>=3&&polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)),'Finite native complete acquisition polygon required.');let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const[x,y]of polygon){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return{id:'original-acquisition-'+index,x0,y0,x1,y1,polygon,...extra};};
  if(selection!==undefined){
   requireValue(selection&&Array.isArray(selection.regions)&&Array.isArray(selection.disabled)&&selection.disabled.every(i=>Number.isSafeInteger(i)&&i>=0&&i<selection.regions.length),'Explicit native complete selection required.');
   const disabled=new Set(selection.disabled),active=selection.regions.filter((_,i)=>!disabled.has(i)),ordinary=active.filter(p=>!same(p,selection.envelope));
   // A sole explicit envelope remains an acquisition, matching native automatic
   // selection. With real smaller acquisitions it stays comparison context.
   regions=(ordinary.length?ordinary:active).map((p,i)=>region(p,i));search=active.map((p,i)=>region(p,i,same(p,selection.envelope)?{envelope:true,kind:'envelope'}:{}));excluded=selection.regions.filter((p,i)=>disabled.has(i)&&!same(p,selection.envelope));
  }else{
   const zones=snapshot.enabled&&snapshot.positiveMode==='selected'?snapshot.zones.filter(z=>z.enabled&&z.kind==='acquisition'):null;
   regions=(zones??[{polygon:poly({x0:0,y0:0,x1:domain.sourceWidth,y1:domain.sourceHeight})}]).map((z,i)=>region(z.polygon,i));
   // Inherited acquisitions are literal analysis windows. Their bounding
   // rectangle is only geometry; it cannot introduce another clone analysis.
   search=structuredClone(regions);
   excluded=snapshot.enabled?snapshot.zones.filter(z=>z.enabled&&z.kind==='exclusion').map(z=>z.polygon):[];
  }
  const scope={schema:'sherloq.scientific-scope/1',coordinates:'original-pixels',sourceSha256:domain.sourceSha256,width:domain.sourceWidth,height:domain.sourceHeight,status:regions.length?'ready':'excluded',nativePreparation:'original-acquisitions-only',regions,searchRegions:search,excluded,text:{status:'pending'},fingerprint:await hash(['automatic-complete-source-scope/1',domain.fingerprint,regions,search,excluded])};
  checkAbort(signal);out.params={...out.params,scientificScope:scope};returned=true;return{task:out,release:free};
 }finally{if(!returned)free();}
}
