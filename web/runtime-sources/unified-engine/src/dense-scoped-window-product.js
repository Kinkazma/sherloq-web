import "../../runtime-context.js?v=0.25.0";
import {acknowledgeDenseRetirement,onceDenseRetirement} from './dense-owner-retirement.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {createDenseNativeWindowCallback} from './dense-native-windows.js';
import {combineDenseWindowPresentation} from './dense-window-presentation.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

export const DENSE_SCOPED_RECIPE='dense-scoped-window/1';
// A fresh carrier owns each complete result; the true native callback/engine
// cache is shared. Thus a new view/result never retires another surface's raw
// fields, while the native threshold/checkpoint cache can still be reused.
export function createDenseScopedWindowProduct(image,budget,{geometry,profile,windowFactory=createSparseCloneWindowEngine,callbackFactory=createDenseNativeWindowCallback,presentationFactory=combineDenseWindowPresentation}={}){
 let callback,closed=false,active=false,finished=Promise.resolve(),closing;const held=new Map(),hooksForRun={};
 const scopeOf=task=>task?.scientificScope??task?.params?.scientificScope;
 const admitted=({task})=>task?.operation==='tampering.copyMove.dense'&&scopeOf(task)?.status==='ready';
 async function prune(){if(held.size!==1||!callback)return;const item=held.values().next().value;if(item.plan)await acknowledgeDenseRetirement(()=>callback.retainWindows(item.plan));}
 return{
  clearCheckpoint:key=>callback?.clearCheckpoint?.(key),
  async analyze(params,hooks={}){
   requireValue(!closed&&!active,'Scoped Dense product is closed or busy.');checkAbort(hooks.signal);
   const task=hooks.sourceRegionTask,scope=scopeOf(task),mode=task?.cloneWindowMode??'independent';
   requireValue(task?.operation==='tampering.copyMove.dense'&&scope?.status==='ready'&&/^[a-f0-9]{64}$/.test(scope.fingerprint??'')&&['independent','global'].includes(mode),'Certified scoped Dense task and mode are required; no whole fallback is permitted.');
   active=true;let finish;finished=new Promise(resolve=>finish=resolve);for(const key of Object.keys(hooksForRun))delete hooksForRun[key];Object.assign(hooksForRun,hooks);
   const item={plan:null,planRelease:null,engine:null,raw:null,closed:false,pending:null,returned:false};held.set(item,item);
   const release=()=>{if(item.pending)return item.pending;item.pending=(async()=>{if(item.closed){await prune();return;}await acknowledgeDenseRetirement(()=>item.raw?.release());await acknowledgeDenseRetirement(()=>item.engine?.dispose());item.planRelease?.();item.closed=true;held.delete(item);await prune();})();item.pending.catch(()=>{item.pending=null;});return item.pending;};item.release=release;
   try{
    const borrowedFactory=({original})=>{
     callback??=callbackFactory({original,budget,profile,geometry,hooks:hooksForRun});
     const run=job=>callback(job);run.runGlobal=job=>callback.runGlobal(job);run.clearCheckpoint=key=>callback.clearCheckpoint?.(key);
     run.retainWindows=async plan=>{const summary=plan.mode==='global'?{mode:'global',global:plan.global?{fingerprint:plan.global.fingerprint}:null,windows:[]}:{mode:'independent',windows:plan.windows.map(w=>({id:w.id,fingerprint:w.fingerprint,status:w.status}))};const free=budget.reserve(4096+sourceRegionTransportBytes(summary)*4);item.planRelease?.();item.planRelease=free;item.plan=summary;await prune();};
     run.dispose=async()=>{};run.state=()=>callback.state?.();return run;
    };
    item.engine=windowFactory(image,budget,profile,{callbackFactory:borrowedFactory,presentationFactory,admitIndependent:admitted,admitGlobal:admitted});
    item.raw=await item.engine.analyze(params,{...hooks,scientificScope:undefined,sourceRegionTask:{...task,params,cloneWindowMode:mode}});checkAbort(hooks.signal);
    const {release:ignored,...data}=item.raw;item.returned=true;return{...data,release};
   }catch(primary){await retireCompositeOwners([release],{primary});throw primary;}finally{active=false;finish();}
  },
  dispose(){closed=true;if(closing)return closing;closing=(async()=>{await finished;await retireCompositeOwners([...held.values()].filter(item=>!item.returned).map(item=>item.release));if(held.size)throw new EngineError('BUSY','Scoped Dense native results still belong to published surfaces or scientific exports.');await acknowledgeDenseRetirement(()=>callback?.dispose());})();closing.catch(()=>{closing=null;});return closing;},
  get state(){return{closed,active,results:held.size,native:callback?.state?.()??null};}
 };
}
