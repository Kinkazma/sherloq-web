import "../../runtime-context.js?v=0.30.0";
import {createOcrRetirementOwner,retireOcrLeases} from './ocr-owned-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createCfaAnalyzer} from './cfa-analyzer.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {cfaStrictParameters,planCfaStrictContexts,copyCfaNativeContext,postprocessCfaStrictContexts} from './cfa-strict-contexts.js';
import {renderCfaStrictWindow} from './cfa-strict-render.js';

/** Experimental orchestration only. M2 admission remains closed until a real
 * model proves Original-phase alignment, separately from these contracts. */
export function createCfaStrictAnalyzer({budget,analyzer,analyzerFactory=createCfaAnalyzer,...configuration}={}) {
 requireValue(budget&&typeof budget.reserve==='function','An explicit CFA owner budget is required.');
 const native=analyzer??analyzerFactory({...configuration,budget}),retirements=new Set();let active,disposed=false,closing=false,disposal,maintenance;
 const retirePending=async except=>{await retireCompositeOwners([...retirements].filter(owner=>owner!==except).map(owner=>()=>owner.release()));};
 return {
  async analyze(image,params={},options={}) {
   if(disposed||closing)throw new EngineError('DISPOSED','CFA strict analyzer disposed.');if(active||maintenance)throw new EngineError('BUSY','CFA strict analysis already running.');
   const unlocalized=sourceRegionUnlocalizedInput({operation:'m2.cfa',params});if(unlocalized)throw new EngineError('SOURCE_COORDINATES_UNLOCALIZED','Bind CFA scientific geometry into its native source domain before analysis.',{details:{unlocalizedInput:unlocalized}});
   const parameters=cfaStrictParameters(params),controller=new AbortController(),abort=()=>controller.abort();let complete;
   active={controller,done:new Promise(r=>complete=r)};options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
   let view,plan,working,current,retained,output,primary,failed=false;const metadataLeases=[];let transaction;
   transaction=createOcrRetirementOwner(async()=>{
    // A dependent source/plan cannot retire before its native child ACK.
    if(current){await current.release();current=null;}
    if(working){await working();working=null;}
    if(retained){await retained();retained=null;}
    if(plan){await plan.release();plan=null;}
    if(view){await view.dispose();view=null;}
    while(metadataLeases.length){await metadataLeases[0]();metadataLeases.shift();}
   },{onReleased:()=>retirements.delete(transaction)});retirements.add(transaction);
   try {
    await retirePending(transaction);checkAbort(controller.signal);const input=options.sourceRegionDomain??image.sourceRegionDomain??image.provenance?.sourceRegionDomain;
    metadataLeases.push(budget.reserve(sourceRegionTransportBytes(input,{allowUndefined:true,allowAliases:true})*8+65536));
    const domain=await compileOriginalSourceRegions(input);checkAbort(controller.signal);
    requireValue(image.sha256===domain.sourceSha256&&image.surface?.readWindow,'CFA source belongs to another original identity.');
    const original=image.surface.descriptor??image;
    requireValue(original.width===domain.sourceWidth&&original.height===domain.sourceHeight,'Strict CFA requires an original-grid surface.');
    view=await createSourceRegionView({...image.surface,sha256:image.sha256},domain.descriptor,{budget,maxReadPixels:2**30});
    plan=await planCfaStrictContexts(view,parameters,{budget,signal:controller.signal});const n=plan.cells;
    // 106 retained bytes/cell; 64 temporary aligned probabilities plus native
    // postprocessor working means. Original graph workspace remains native.
    retained=budget.reserve(n*106+16384);working=budget.reserve(n*65+64);
    const fields={probabilities:new Float32Array(n*16),native_grids:new Float32Array(n*4),native_local_grid:new Uint8Array(n),native_suspicion:new Float32Array(n)};const executions=[];
    for(const fragment of plan.fragments) {
     checkAbort(controller.signal);if(!fragment.count)continue;
     const r=fragment.rect,surface={descriptor:{id:(plan.direct?'cfa-strict/':'cfa-native-cell-plan/2/'+plan.fingerprint+'/')+domain.fingerprint+'/'+[r.x,r.y,r.width,r.height].join(','),revision:1,width:r.width,height:r.height,format:'rgb8'},async readWindow(rect,hooks={}){return view.readWindow({...rect,x:r.x+rect.x,y:r.y+rect.y},hooks);}};
     current=await native.analyze({width:r.width,height:r.height,sha256:image.sha256,surface},parameters,{...options,signal:controller.signal});checkAbort(controller.signal);
     copyCfaNativeContext(fields,current,fragment,n);const receipt={fragment:fragment.index,provenance:current.provenance??{},metrics:current.metrics??{}};
     metadataLeases.push(budget.reserve(sourceRegionTransportBytes(receipt,{allowUndefined:true,allowAliases:true})*2+1024));executions.push(structuredClone(receipt));
     await current.release();current=null;options.onProgress?.({phase:'cfa-native-contexts',completed:fragment.index+1,total:plan.fragments.length,fraction:(fragment.index+1)/plan.fragments.length});
    }
    checkAbort(controller.signal);const post=postprocessCfaStrictContexts(fields.probabilities,plan.fragments,n);working();working=null;
    const nonEvaluableContexts=plan.fragments.filter(f=>!f.evaluable).length,evaluation=!n?'native-not-evaluable':nonEvaluableContexts||plan.rejectedNativeCells?'partially-evaluable':'complete';
    const data={width:domain.width,height:domain.height,segmented:true,...fields,grids:post.grids,means:post.means,local_grid:post.local,suspicion:post.suspicion,cellCount:n,metadata:{method:'adaptive_cfa',fragmented:true,...parameters,best_grid:post.best,gridLayout:'packed-native-context-cells',sourceRegionOrigin:[...domain.origin],originalShape:[domain.sourceHeight,domain.sourceWidth],fragments:plan.fragments,cellPlan:{version:plan.version,fingerprint:plan.fingerprint,windowOrigin:plan.windowOrigin,windowGridShape:plan.windowGridShape,nativeCells:plan.nativeCells,rejectedNativeCells:plan.rejectedNativeCells,direct:plan.direct,order:'retained-native-window-row-major'},sourceRegionEvaluation:evaluation,selectedPixels:plan.selectedPixels,modeledPixels:plan.modeledPixels,nonEvaluatedSelectedPixels:plan.selectedPixels-plan.modeledPixels,phasePolicy:'Local native probabilities retained; dominant-grid scores aligned by XOR with Original decoded 2x2 origin parity.',statisticsPolicy:'One native FP32 cfaPostprocess over all complete native cells; equal block-square cell weights; no padding or excluded RGB.'}};
    const releaseOutput=retained,releaseMetadata=plan.release,receipts=metadataLeases.splice(0);retained=null;plan=null;const outputLeases=[releaseOutput,releaseMetadata,...receipts].map(free=>createOcrRetirementOwner(free)),outputOwner=createOcrRetirementOwner(()=>retireOcrLeases(outputLeases.map(owner=>()=>owner.release())));
    return output={data,provenance:{sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],originalSourceSha256:domain.sourceSha256,adapter:'cfa-strict-native-contexts-experimental',modelPhaseQualification:'pending-real-model',nativeParameters:{...parameters},nativeCellPlan:{version:data.metadata.cellPlan.version,fingerprint:data.metadata.cellPlan.fingerprint},executions},metrics:{nativeContexts:data.metadata.fragments.length,evaluatedContexts:executions.length,nonEvaluableContexts,sourceRegionEvaluation:evaluation,selectedPixels:data.metadata.selectedPixels,analysedPixels:data.metadata.modeledPixels,unanalysablePixels:data.metadata.nonEvaluatedSelectedPixels,cache:{native:executions.map(e=>e.metrics.cache??null)},memory:budget.snapshot()},release(){return outputOwner.release();}};
   }catch(error){failed=true;primary=error;throw error;}finally {
    let cleanupFailed=false,cleanup;
    try{await transaction.release();}catch(error){
     cleanupFailed=true;cleanup=error;
     if(output)await retireCompositeOwners([()=>output.release()],{primary:error});
     if(failed&&primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.cleanupError=error;}catch{}
    }finally{options.signal?.removeEventListener('abort',abort);active=null;complete();}
    if(cleanupFailed&&!failed)throw cleanup;
   }
  },
  renderWindow(image,result,mode,rect,options={}){return renderCfaStrictWindow(image,result,mode,rect,{...options,budget});},
  render(image,result,mode=0,options={}){return this.renderWindow(image,result,mode,{x:0,y:0,width:result.data.width,height:result.data.height},options);},
  clearCache(){
   if(disposed)return;if(disposal)return disposal;if(maintenance)return maintenance;
   const task=(async()=>{const pending=active;pending?.controller.abort();await pending?.done;await retirePending();await native.clearCache();})();
   maintenance=task.finally(()=>{maintenance=undefined;});return maintenance;
  },
  dispose(){
   if(disposed)return;if(disposal)return disposal;closing=true;
   const task=(async()=>{if(maintenance)await maintenance;const pending=active;pending?.controller.abort();await pending?.done;await retirePending();await native.dispose();disposed=true;})();
   disposal=task.finally(()=>{disposal=undefined;});return disposal;
  },
  memory(){return budget.snapshot();}
 };
}
