import {createSparseSurface} from './m3-sparse-surface.js';
import {medianGrid,medianEnlargeRows,medianParams,medianGeometry} from './median.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {payloadBytes} from './pixel-operations.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// This module has no detector, descriptor extractor, matcher, predictor or NN
// entry point. It only renders complete previously returned native tables.
export function createNativeRenderOwner(onOwner){
 const resources=new Set(),credits=new Set();let closing;
 const owner={resources,credits,async dispose(){if(closing)return closing;const task=retireCompositeOwners([...resources].map(resource=>async()=>{await resource.dispose();resources.delete(resource);}));closing=task;try{await task;if(!resources.size)for(const free of [...credits]){await free();credits.delete(free);}}finally{closing=null;}}};
 onOwner?.(owner);return owner;
}
export function assertRetainedNativeRender(task,retained,{original,domain}){
 requireValue(['various.median','tampering.copyMove.sparse','tampering.copyMove.dense'].includes(task.operation),'Only native median, sparse and Dense tables have this render-only endpoint.');
 requireValue(retained&&retained.operation===task.operation&&retained.sourceSha256===original.sha256,'Retained tables belong to another operation or Original.');
 requireValue((retained.domainFingerprint??null)===(domain?.fingerprint??null),'Retained tables belong to another source domain.');
 const mutable=task.operation==='various.median'?new Set(['variance','threshold','speckle','showScore']):new Set();
 let prior=retained.params??{};
 if(task.operation==='tampering.copyMove.dense'&&retained.provenance?.sourceRegionOriginalParams!==undefined){
  requireValue(domain&&retained.provenance.originalSha256===original.sha256&&retained.provenance.sourceRegionDomain?.fingerprint===domain.fingerprint,'Retained Dense Original parameters have another source or domain.');
  prior=retained.provenance.sourceRegionOriginalParams;
 }
 const requested=task.params??{};
 for(const key of new Set([...Object.keys(requested),...Object.keys(prior)]))if(!mutable.has(key))requireValue(JSON.stringify(requested[key])===JSON.stringify(prior[key]),'A scientific parameter changed; this endpoint cannot run analysis.');
 if(task.operation==='tampering.copyMove.sparse'){
  const mode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode)&&retained.cloneWindowMode===mode,'Retained sparse mode differs from its executed window mode.');
 }
}
function retainData(surface,data,budget){
 const n=payloadBytes(data);budget.retain(n);let disposed=false;const retire=surface.dispose.bind(surface);
 surface.dispose=async()=>{if(disposed)return;await retire();budget.retained-=n;disposed=true;};return surface;
}
async function medianRecord(analysis,params,context,{budget,signal,owner}){
 const g=analysis?.geometry;requireValue(g&&JSON.stringify(g)===JSON.stringify(medianGeometry(context.width,context.height)),'Retained median native geometry differs.');
 const cells=g.width*g.height;requireValue(analysis.probabilities instanceof Float32Array&&analysis.probabilities.length===cells&&analysis.variances instanceof Float64Array&&analysis.variances.length===cells,'Retained native median scores are incomplete.');
 const hold=budget.reserve(cells*64+context.width*6+65536);owner.credits.add(hold);
 const options={budget,signal,temporarySession:context.session,getTemporarySession:context.ensureTemporarySession},cooperate=createCooperator(signal);
 const output=await createSegmentedBytes(context.width*context.height*3,options);owner.resources.add(output);
 const validStore=await createSegmentedBytes(cells,options);owner.resources.add(validStore);
 const decisionStore=await createSegmentedBytes(cells,options);owner.resources.add(decisionStore);
 const rendered=await medianGrid(analysis,params,{signal,cooperate});await validStore.write(rendered.valid);await decisionStore.write(rendered.decisions);
 const rows=Math.min(context.height,Math.max(1,Math.floor(262144/context.width))),rowLease=budget.reserve(rows*context.width*3);owner.credits.add(rowLease);
 for(let y=0;y<context.height;y+=rows){await cooperate();const count=Math.min(rows,context.height-y);await output.write(await medianEnlargeRows(rendered.rgb,g,{signal,cooperate,start:y,rows:count}),y*context.width*3);}
 await output.flush();await validStore.flush();await decisionStore.flush();checkAbort(signal);rowLease();owner.credits.delete(rowLease);
 const data={...analysis,geometry:structuredClone(g),filtered:rendered.filtered,mean:rendered.mean,validBlocks:rendered.validBlocks};
 const surface=retainData(createRgbSurface(output,{width:context.width,height:context.height,budget}),data,budget);owner.resources.delete(output);owner.resources.add(surface);
 const valid=createMaskSurface(validStore,{width:g.width,height:g.height,budget,range:[0,1],semantics:'Native64x64 block variance decision.'});owner.resources.delete(validStore);owner.resources.add(valid);
 const decisions=createMaskSurface(decisionStore,{width:g.width,height:g.height,budget,range:[0,2],semantics:'Native64x64 block decisions:0 invalid,1 below threshold,2 at or above threshold.'});owner.resources.delete(decisionStore);owner.resources.add(decisions);
 const masks={valid:{...valid.descriptor,data:rendered.valid},decisions:{...decisions.descriptor,data:rendered.decisions}};
 hold();owner.credits.delete(hold);return{surface,maskRecords:{valid:{surface:valid},decisions:{surface:decisions}},data,masks};
}

export async function renderRetainedNativeTables({task,image,original,domain,view,retained,budget,signal,onOwner}){
 const owner=createNativeRenderOwner(onOwner),started=performance.now();checkAbort(signal);
 requireValue(retained&&retained.operation===task.operation&&retained.sourceSha256===original.sha256,'Retained render belongs to another operation or Original.');
 requireValue((retained.domainFingerprint??null)===(domain?.fingerprint??null),'Retained render belongs to another source domain.');
 const data=retained.data,d=image.surface?.descriptor??image.pixels;requireValue(d&&Number.isSafeInteger(d.width)&&Number.isSafeInteger(d.height),'Retained render source is invalid.');
 if(task.operation==='tampering.copyMove.sparse'){
  requireValue((data?.points instanceof Float64Array||data?.points instanceof Float32Array)&&data.points.length%7===0&&data.pairs instanceof Float64Array&&data.pairs.length%4===0&&Array.isArray(data.groups)&&data.colors instanceof Uint8Array,'Complete native sparse tables are required for exact rendering.');
  const raw={...data},record=await createSparseSurface(image,raw,task.view??{},{budget,signal});owner.resources.add(record.surface);const presented={...raw,metadata:{...raw.metadata,presentation:{...raw.metadata?.presentation,traceSelection:record.traceSelection}}};retainData(record.surface,presented,budget);
  return{owner,record:{...record,data:presented},answer:{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:presented,style:record.style,visible:record.visible,legend:record.legend,selectedGroups:record.selectedGroups,provenance:{...retained.provenance,params:retained.params},metrics:{nativeAnalysisCalls:0,inferenceCalls:0,retainedNativeTables:true,totalMs:performance.now()-started}}};
 }
 requireValue(task.operation==='various.median','Only native sparse presentation and median retained grids use this endpoint.');const p=medianParams(task.params);
 if(!Array.isArray(data?.fragments)){
  const record=await medianRecord(data,p,{width:d.width,height:d.height,session:image.session,ensureTemporarySession:image.ensureTemporarySession},{budget,signal,owner});
  return{owner,record,answer:{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',data:record.data,masks:record.masks,provenance:{...retained.provenance,params:p},metrics:{nativeAnalysisCalls:0,inferenceCalls:0,retainedNativeTables:true,totalMs:performance.now()-started}}};
 }
 requireValue(domain&&view&&data.sourceRegionFingerprint===domain.fingerprint&&data.width===d.width&&data.height===d.height,'Retained median contexts differ from the source domain.');
 const rects=[...view.admittedRectangles()];requireValue(rects.length===data.fragments.length,'Retained median context coverage differs.');
 const output=await createSegmentedBytes(d.width*d.height*3,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});owner.resources.add(output);
 const scope=await createSegmentedBytes(d.width*d.height,{budget,signal,temporarySession:original.session,getTemporarySession:original.ensureTemporarySession});owner.resources.add(scope);
 const rgbRecords={},maskRecords={},fragments=[],cooperate=createCooperator(signal),chunk=65536,credit=budget.reserve(chunk*8);owner.credits.add(credit);
 // This is the existing native-context presentation composition: Original
 // outside admitted contexts, and each exact native median RGB at its bounds.
 for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x+=chunk){await cooperate();const width=Math.min(chunk,d.width-x),window=await original.surface.readWindow({x:x+domain.origin[0],y:y+domain.origin[1],width,height:1},{signal});try{await output.write(window.pixels.data,(y*d.width+x)*3);}finally{await window.release();}}
 for(let i=0;i<rects.length;i++){
  const r=rects[i],f=data.fragments[i],bounds=[r.x,r.y,r.x+r.width,r.y+r.height];requireValue(JSON.stringify(f.bounds)===JSON.stringify(bounds),'Retained median context bounds changed.');
  const record=await medianRecord(f.native,p,{width:r.width,height:r.height,session:original.session,ensureTemporarySession:original.ensureTemporarySession},{budget,signal,owner});rgbRecords[f.id]={surface:record.surface};maskRecords['valid_'+i]=record.maskRecords.valid;maskRecords['decisions_'+i]=record.maskRecords.decisions;
  for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x+=chunk){await cooperate();const width=Math.min(chunk,r.width-x),window=await record.surface.readWindow({x,y,width,height:1},{signal});try{await output.write(window.pixels.data,((r.y+y)*d.width+r.x+x)*3);await scope.write(new Uint8Array(width).fill(1),(r.y+y)*d.width+r.x+x);}finally{await window.release();}}
  fragments.push({...f,native:record.data,nativeMasks:record.masks,analysisCacheHit:true});
 }
 await output.flush();await scope.flush();checkAbort(signal);credit();owner.credits.delete(credit);
 const surface=createRgbSurface(output,{width:d.width,height:d.height,budget});owner.resources.delete(output);owner.resources.add(surface);const selection=createMaskSurface(scope,{width:d.width,height:d.height,budget,range:[0,1],semantics:'1=admitted complete native median context;0=Original presentation.'});owner.resources.delete(scope);owner.resources.add(selection);maskRecords.analysis_scope={surface:selection};
 const next={...data,fragments};return{owner,record:{surface,rgbRecords,maskRecords,data:next},answer:{id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',layout:'surface',data:next,semantics:retained.semantics,provenance:{...retained.provenance,params:p},metrics:{nativeAnalysisCalls:0,inferenceCalls:0,retainedNativeTables:true,fragmentCount:fragments.length,totalMs:performance.now()-started}}};
}
