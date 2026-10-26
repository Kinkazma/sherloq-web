import "../../runtime-context.js?v=0.25.0";
import {createAutomaticElaProvider} from './automatic-ela-provider.js';
import {createAutomaticCompleteElaPresentation} from './automatic-complete-ela-presentation.js';
import {prepareAutomaticCompleteElaContexts} from './automatic-complete-ela-contexts.js';
import {elaCellParams} from './ela-cell-pipeline.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {checkAbort,requireValue,EngineError,controlCheckpoint} from './errors.js';

function owned(value,retire){
 let refs=1,done=false,pending;
 const releaseOwner=()=>{if(done||refs)return pending;if(pending)return pending;pending=Promise.resolve().then(retire).then(()=>{done=true;},error=>{pending=undefined;throw error;});return pending;};
 const loan=()=>{let released=false;return{value,async release(){if(!released){released=true;refs--;}await releaseOwner();}};};
 return{...loan(),retain(){requireValue(!done&&refs>0,'Complete ELA value is retired.');refs++;return loan();}};
}
const shift=(polys,x,y)=>polys.map(poly=>poly.map(([a,b])=>[a-x,b-y]));
function entryInSource(entry,context){
 const [x,y]=context.bounds,out=structuredClone(entry);out.id='ela-context-'+context.index+'/'+entry.id;
 if(out.origin)out.origin=[out.origin[0]+x,out.origin[1]+y];
 if(out.polygons)out.polygons=out.polygons.map(poly=>poly.map(([a,b])=>[a+x,b+y]));
 out.provenance={...out.provenance,nativeContext:context.index,nativeContextId:context.id,nativeEntryId:entry.id,nativeContextBounds:[...context.bounds],...(out.cells?{nativeCellGridOrigin:[x,y]}:{})};return out;
}

/** The five-group aggregate reuses its native ELA provider per exact admitted
 * context. Statistics remain per context, not averaged or placed in a fake
 * full-frame cell lattice. This changes no JPEG/cell/Ghost/Energy parameter. */
export function createAutomaticCompleteElaProvider({image,budget,getContext,providerFactory=createAutomaticElaProvider,...options}={}){
 const p=elaCellParams(options.cellParams),lifetime=new AbortController(),pendingRetirements=new Set();let entry,fullProvider,running,closed=false,disposal;
 const alive=signal=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','Complete ELA provider is closed.');};
 async function build(hooks){
  let contextOwner,contextRetirement,presentation,returned=false,failed=false,primary;const providers=[],rawLoans=[],leases=[];
  const cleanup=async()=>{pendingRetirements.add(cleanup);await retireCompositeOwners([()=>presentation?.dispose(),...rawLoans.map(l=>()=>l.release()),...providers.map(p=>()=>p.dispose())]);await(contextOwner??contextRetirement)?.dispose();for(const free of leases)free();pendingRetirements.delete(cleanup);};
  try{
   const prepared=await getContext(hooks);alive(hooks.signal);
   contextOwner=await prepareAutomaticCompleteElaContexts(prepared,{budget,block:p.block,signal:hooks.signal,original:image.originalSource??image,onRetirementOwner:owner=>contextRetirement=owner});alive(hooks.signal);
   const only=contextOwner.contexts.length===1?contextOwner.contexts[0]:null;
   if(only?.evaluable&&only.bounds[0]===0&&only.bounds[1]===0&&only.bounds[2]===contextOwner.width&&only.bounds[3]===contextOwner.height){
    const provider=providerFactory({...options,image,budget});providers.push(provider);const raw=await provider.run({id:'ela',enabled:true},hooks);rawLoans.push(raw);alive(hooks.signal);fullProvider=provider;const {image:ignored,...nativeContext}=only;presentation=createAutomaticCompleteElaPresentation({width:contextOwner.width,height:contextOwner.height,contextOwner,nativeContexts:[{context:nativeContext,raw}]},{image,budget});const nativeContextPresentation={contexts:[nativeContext],coverage:contextOwner.coverage,policy:contextOwner.contextPolicy};returned=true;return owned({...raw.value,nativeContextPresentation,previewFor:id=>presentation.previewFor(id),energyPreview:(field,id)=>presentation.energyPreview(field,id)},cleanup);
   }
   const fragments=[];
   for(const context of contextOwner.contexts){
    await controlCheckpoint(hooks.signal);const fragment={context};fragments.push(fragment);
    if(context.evaluable){
     const provider=providerFactory({...options,image:context.image,budget});providers.push(provider);fragment.provider=provider;
     fragment.raw=await provider.run({id:'ela',enabled:true},{...hooks,onProgress:event=>hooks.onProgress?.({...event,nativeContext:context.index,nativeContextCount:contextOwner.contexts.length})});rawLoans.push(fragment.raw);alive(hooks.signal);
    }
   }
   const contexts=contextOwner.contexts.map(({image,...context})=>({...context})),coverage=contextOwner.coverage,selected=contextOwner.domain.countIncluded,analysed=coverage.coveredUniquePixels,metadata={schema:'sherloq.automatic-complete-ela-contexts/1',contextPolicy:contextOwner.contextPolicy,contextPlanFingerprint:contextOwner.contextPlanFingerprint,coverage,sourceSha256:contextOwner.domain.sourceSha256,sourceFingerprint:contextOwner.domain.fingerprint,contextFingerprint:prepared.fingerprint,contexts,nativeContextAvailability:{schema:'sherloq.native-context-availability/1',status:!analysed?'not-evaluable':analysed<selected?'partial':'complete',selectedPixels:selected,analysedPixels:analysed,unanalysablePixels:selected-analysed,contextRgbPositions:coverage.contextRgbPositions,overlapExtraPositions:coverage.overlapExtraPositions,maximumMultiplicity:coverage.maximumMultiplicity},reference:'separate-complete-native-crop-populations',cloneEnvelopeGaps:'not ELA observations',grids:'native cell grids, qualities and profiles retained per context; no global interpolation or average'};
   leases.push(budget.reserve(8192+sourceRegionTransportBytes(metadata,{allowAliases:true,allowUndefined:true})*4));
   const value={width:contextOwner.width,height:contextOwner.height,nativeContexts:fragments,metadata,metrics:{contexts:contexts.length,evaluatedContexts:contexts.filter(c=>c.evaluable).length,selectedPixels:selected,analysedPixels:analysed,...coverage},nativeContextPresentation:{contexts,coverage,policy:contextOwner.contextPolicy},contextOwner};
   presentation=createAutomaticCompleteElaPresentation(value,{image,budget});value.preview=presentation.preview;value.previewFor=id=>presentation.previewFor(id);value.energy=fragments.some(f=>f.raw?.value.energy)?presentation.energy:null;value.energyPreview=(field,id)=>presentation.energyPreview(field,id);
   // Rendering/export adapters consume these explicit native records. They may
   // never interpret absent cells or an excluded fragment as a numerical zero.
   returned=true;return owned(value,cleanup);
  }catch(error){failed=true;primary=error;throw error;}finally{if(!returned){pendingRetirements.add(cleanup);await retireCompositeOwners([cleanup],failed?{primary}:{});}}
 }
 return{
  async run(job,hooks={}){alive(hooks.signal);requireValue(job.id==='ela'&&job.enabled,'Enabled complete ELA group required.');if(running)throw new EngineError('BUSY','Complete ELA context preparation is running.');const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;running=Promise.resolve().then(async()=>{await retireCompositeOwners([...pendingRetirements].map(retire=>()=>retire()));alive(signal);if(!entry)entry=await build({...hooks,signal});alive(signal);return entry.retain();});try{return await running;}finally{running=null;}},
  async prepare(value,filters,hooks={}){
   alive(hooks.signal);requireValue(value===entry?.value,'Complete ELA preparation belongs to another source.');const hold=entry.retain(),selected=[],leases=[];let returned=false,failed=false,primary;
   const cleanup=async()=>{pendingRetirements.add(cleanup);await retireCompositeOwners(leases.map(l=>()=>l.release()));await hold.release();pendingRetirements.delete(cleanup);};
   try{
    if(fullProvider){const selected=await fullProvider.prepare(value,filters,hooks);leases.push(selected);alive(hooks.signal);returned=true;return owned({...selected.value,entries:selected.value.entries.map(e=>({...e,provenance:{...e.provenance,nativeContextId:value.nativeContextPresentation.contexts[0].id}})),nativeContextPresentation:value.nativeContextPresentation},cleanup);}
    for(const fragment of value.nativeContexts){await controlCheckpoint(hooks.signal);const c=fragment.context;if(!c.evaluable)continue;
     const plan={...hooks.plan,active:shift(hooks.plan.active,c.bounds[0],c.bounds[1]),excluded:shift(hooks.plan.excluded,c.bounds[0],c.bounds[1])};
     const prepared=await fragment.provider.prepare(fragment.raw.value,filters,{...hooks,plan});leases.push(prepared);alive(hooks.signal);selected.push({context:c,value:prepared.value});
    }
    const entries=selected.flatMap(s=>s.value.entries.map(e=>entryInSource(e,s.context))),out={width:value.width,height:value.height,nativeContexts:selected,entries,metadata:structuredClone(value.metadata),nativeContextPresentation:value.nativeContextPresentation};
    returned=true;return owned(out,cleanup);
   }catch(error){failed=true;primary=error;throw error;}finally{if(!returned)await retireCompositeOwners([cleanup],failed?{primary}:{});}
  },
  async releaseCheckpoint(){requireValue(!running,'Complete ELA preparation is running.');await retireCompositeOwners((entry?.value.nativeContexts??[]).filter(f=>f.provider).map(f=>()=>f.provider.releaseCheckpoint?.()));},
  dispose(){if(disposal)return disposal;closed=true;lifetime.abort();disposal=(async()=>{try{await running;}catch{}await retireCompositeOwners([async()=>{if(entry){await entry.release();entry=null;}},...[...pendingRetirements].map(retire=>()=>retire())]);})().catch(error=>{disposal=undefined;throw error;});return disposal;}
 };
}
