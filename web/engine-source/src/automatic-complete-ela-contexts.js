import {createSourceRegionView} from './source-region-view.js';
import {createSourceRegionJpegContextImage} from './source-region-ela.js';
import {planEnergyNativeContexts} from './energy-native-context-plan.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** ELA references are separate complete native crop populations. Acquisition gaps
 * permitted as comparison context by clone engines do not enter these profiles.
 * This owns geometry and copied windows; it never owns the Original decoder. */
export async function prepareAutomaticCompleteElaContexts(prepared,{budget,block,signal,original,onRetirementOwner}={}){
 requireValue(prepared?.originalTask?.operation==='analysis.complete'&&budget?.reserve,'Complete ELA requires its own verified strict preparation.');
 const held=new Set(),leases=[];let view,plan,planningOwner,closed=false,disposal,returned=false,failed=false,primary,finish;
 const constructionDone=new Promise(resolve=>finish=resolve);
 const retire=async()=>{await retireCompositeOwners([...[...held].map(w=>async()=>{await w.release();held.delete(w);}),()=>view?.dispose()]);await (plan??planningOwner)?.dispose();for(const free of leases)free();};
 const owner={dispose(){if(disposal)return disposal;closed=true;disposal=constructionDone.then(retire).catch(error=>{disposal=undefined;throw error;});return disposal;}};
 try{
  onRetirementOwner?.(owner);
  leases.push(budget.reserve(65536+sourceRegionTransportBytes([prepared.candidateDomain.descriptor,prepared.originalTask],{allowAliases:true,allowUndefined:true})*4));
  const ceiling=await compileOriginalSourceRegions(prepared.sourceDomain.descriptor),candidate=await compileOriginalSourceRegions(prepared.candidateDomain.descriptor),context=await compileOriginalSourceRegions(prepared.contextDomain.descriptor),d=prepared.source.descriptor;
  requireValue(ceiling.fingerprint===prepared.sourceDomain.fingerprint&&candidate.fingerprint===prepared.candidateDomain.fingerprint&&context.fingerprint===prepared.contextDomain.fingerprint&&ceiling.sourceSha256===candidate.sourceSha256&&candidate.sourceSha256===context.sourceSha256&&prepared.source.sha256===ceiling.sourceSha256&&d.width===ceiling.sourceWidth&&d.height===ceiling.sourceHeight&&ceiling.width===prepared.width&&ceiling.height===prepared.height&&ceiling.origin[0]===prepared.origin[0]&&ceiling.origin[1]===prepared.origin[1],'Complete ELA contexts differ from their Original source or signed domains.');
  const covers=(domain,y,left,right)=>{let edge=left;for(const[a,b]of domain.rowIntervals(y-domain.origin[1])){const x=a+domain.origin[0],r=b+domain.origin[0];if(r<=edge)continue;if(x>edge)return false;edge=Math.max(edge,r);if(edge>=right)return true;}return false;};
  for(let y=0;y<candidate.height;y++){
   if(y%32===0)await controlCheckpoint(signal);const oy=y+candidate.origin[1];
   for(const[a,b]of candidate.rowIntervals(y)){const x=a+candidate.origin[0],r=b+candidate.origin[0];requireValue(covers(ceiling,oy,x,r)&&covers(context,oy,x,r),'Complete ELA candidates exceed an Original ceiling or a true-negative context.');}
  }
  view=await createSourceRegionView(prepared.source,prepared.candidateDomain.descriptor,{budget,maxReadPixels:65536});checkAbort(signal);
  plan=await planEnergyNativeContexts({domain:view.domain,view,requestedBlock:block},{budget,signal,onOwner:owner=>planningOwner=owner});checkAbort(signal);
  const parentOrigin=prepared.origin,domain=view.domain;
  // The JPEG context helper consumes synchronous owned windows. Copy and ACK
  // every source lease first, so it cannot hide an asynchronous release error.
  const bridge={async readWindow(rect,hooks={}){
   requireValue(!closed,'Complete ELA source owner is closed.');checkAbort(hooks.signal);let source,release,returned=false;
   try{
    source=await view.readWindow(rect,hooks);held.add(source);checkAbort(hooks.signal);
    release=budget.reserve(source.pixels.data.byteLength);const data=source.pixels.data.slice(),pixels={...source.pixels,data};
    await source.release();held.delete(source);source=null;checkAbort(hooks.signal);
    let done=false;returned=true;return{pixels,release(){if(!done){done=true;release();}}};
   }finally{if(!returned)release?.();}
  }};
  const contexts=[];
  for(const native of plan.contexts){
   await controlCheckpoint(signal);leases.push(budget.reserve(2048));
   const [left,top,right,bottom]=native.bounds,rect={x:left,y:top,width:right-left,height:bottom-top},x=left+domain.origin[0],y=top+domain.origin[1],bounds=[x-parentOrigin[0],y-parentOrigin[1],right+domain.origin[0]-parentOrigin[0],bottom+domain.origin[1]-parentOrigin[1]];
   contexts.push(Object.freeze({id:'ela_'+plan.fingerprint+'_'+contexts.length,index:contexts.length,bounds,originalBounds:[x,y,right+domain.origin[0],bottom+domain.origin[1]],...native.admission,jpegPhase:[0,0],status:'analysed',image:createSourceRegionJpegContextImage(bridge,rect,original??{surface:prepared.source},budget)}));
  }
  checkAbort(signal);requireValue(!closed,'Complete ELA construction was retired.');returned=true;
  return{...owner,contexts,domain,coverage:plan.coverage,contextPlanFingerprint:plan.fingerprint,contextPolicy:plan.policy,fingerprint:prepared.fingerprint,origin:[...parentOrigin],width:prepared.width,height:prepared.height};
 }catch(error){failed=true;primary=error;throw error;}finally{finish();if(!returned)await retireCompositeOwners([()=>owner.dispose()],failed?{primary}:{});}
}
