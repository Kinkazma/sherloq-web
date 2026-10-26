import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
// This initial tranche is a source/preparation contract only. It is not wired
// into segmentation admission and does not declare a qualified learned head.
function* admittedRectangles(domain){
 let active=new Map();for(let y=0;y<domain.height;y++){
  const next=new Map();for(const[x,right]of domain.rowIntervals(y)){const key=x+':'+right,prior=active.get(key);next.set(key,prior?{...prior,height:prior.height+1}:{x,y,width:right-x,height:1});}
  for(const[key,rect]of active)if(!next.has(key))yield rect;active=next;
 }yield*active.values();
}
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function planMgcfdnEffnetWindowContexts(view,{budget,signal,windowFingerprint}={}){
 requireValue(view?.domain?.descriptor&&typeof view.includesRectangle==='function'&&typeof budget?.reserve==='function','Verified native MGCFDN_EFFNET source view and budget required.');checkAbort(signal);requireValue(typeof windowFingerprint==='string'&&/^[a-f0-9]{64}$/.test(windowFingerprint),'Exact canonical autonomous window fingerprint required');
 const supplied=view.domain,fingerprint=supplied.fingerprint,metadata=budget.reserve(65536+sourceRegionTransportBytes(supplied.descriptor,{allowAliases:true})*8),loans=[metadata];let returned=false;
 try{
  const domain=await compileOriginalSourceRegions(supplied.descriptor);checkAbort(signal);requireValue(view.domain===supplied&&domain.fingerprint===fingerprint,'MGCFDN source domain changed during validation.');
  const contexts=[];let observed=0;
  for(const rect of admittedRectangles(domain)){
   if((contexts.length&31)===0)await controlCheckpoint(signal);requireValue(view.domain===supplied&&view.includesRectangle(rect),'MGCFDN context exceeds its validated reader.');
   loans.push(budget.reserve(1024));const index=contexts.length,bounds=[rect.x+domain.origin[0],rect.y+domain.origin[1],rect.x+rect.width+domain.origin[0],rect.y+rect.height+domain.origin[1]];observed+=rect.width*rect.height;
   requireValue(Number.isSafeInteger((index+1)*256),'MGCFDN feature-bank index overflow.');
   contexts.push(Object.freeze({index,id:'mgcf_effnet-native-'+index,rect:Object.freeze({...rect}),bounds:Object.freeze(bounds),width:rect.width,height:rect.height,inputSide:256,featureShape:Object.freeze([1,464,16,16]),bankOffset:index*256,featureCells:256,selectedPixels:rect.width*rect.height,status:'native-preparation-required'}));
  }
  requireValue(observed===domain.countIncluded,'MGCFDN contexts do not cover the exact selected population.');checkAbort(signal);
  const identity=await digest(['mgcfdn-effnet-one-window-source-contexts/1',domain.sourceSha256,windowFingerprint,fingerprint,contexts.map(v=>v.bounds)]);checkAbort(signal);requireValue(view.domain===supplied,'MGCFDN source changed during plan digest.');
  const cells=BigInt(contexts.length)*256n,featureBytes=cells*464n*4n,pairBytes=cells*cells*4n;let disposed=false;
  const plan=Object.freeze({schema:'sherloq.mgcfdn-source-context-plan/1',variant:'mgcfdn-effnet',windowFingerprint,qualifiedLearnedHead:false,identity,sourceSha256:domain.sourceSha256,domainFingerprint:fingerprint,sourceWidth:domain.sourceWidth,sourceHeight:domain.sourceHeight,origin:Object.freeze([...domain.origin]),sourceBounds:Object.freeze([domain.rect.x0,domain.rect.y0,domain.rect.x1,domain.rect.y1]),selectedPixels:observed,contexts:Object.freeze(contexts),featureCells:Number(cells),featureBankBytes:featureBytes.toString(),singlePairMatrixBytes:pairBytes.toString(),directNativeRectangle:contexts.length===1,semantics:'Disjoint complete admitted source rectangles, unchanged native RGB8/Pillow256 preparation. Original positions are retained; cross-context learned-head topology/prior is not admitted by this plan.',dispose(){if(disposed)return;disposed=true;for(const free of loans.splice(0))free();}});returned=true;return plan;
 }finally{if(!returned)for(const free of loans.splice(0))free();}
}
