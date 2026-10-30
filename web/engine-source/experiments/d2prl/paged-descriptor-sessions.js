import {createPagedUnionHead} from './union-head-paged.js';
import {createDescriptors} from './descriptors.js';
import {createPagedDescriptorTransport} from './descriptor-paged-transport.js';
import {createPagedFeatureMath} from './feature-math-paged.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
const ack=async work=>{const result=await work();if(result===0||result===false)throw result;};
const note=(primary,cleanup)=>{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,pagedDescriptorRetirement:cleanup};}catch{}};
/** Per-bank source lifetime, never a global/previous-image storage session.
 * The manager is adopted before construction of any paged owner. A failed
 * retirement remains in the map and blocks the next source until actual ACK.
 * Original feature helpers and the descriptor graph retain their math/order. */
export function createPagedDescriptorSessions({budget,featureMath,descriptorOptions,onOwner,transportFactory=createPagedDescriptorTransport,mathFactory=createPagedFeatureMath,descriptorFactory=createDescriptors,unionOptions,unionFactory=createPagedUnionHead}={}){
 requireValue(budget?.reserve&&featureMath?.run&&descriptorOptions?.inputSide!==448&&typeof onOwner==='function','Pre-owned large-grid descriptor sessions required');
 const contexts=new Map();let closed=false,closing;
 const alive=()=>{if(closed)throw new EngineError('DISPOSED','Paged descriptor sessions closed');};
 const make=bank=>{
  requireValue(typeof bank?.storageContext==='function','Current strict source storage capsule required');
  const life=new AbortController(),running=new Set(),retirementFailures=[];let transport,math,stage,union,initialized=false,retired=false,retiring,contextClosed=false;
  const done={union:!unionOptions,stage:false,math:false,transport:false};
  const context={
   initialize(){const options=bank.storageContext();transport=transportFactory({budget,...options,storage:'temporary',onOwner:value=>{transport=value;}});math=mathFactory({math:featureMath,budget,tensorFactory:(shape,dtype)=>transport.outputFactory(shape,dtype)});stage=descriptorFactory({...descriptorOptions,budget,math,pagedTransport:transport});if(unionOptions)union=unionFactory({...unionOptions,budget,featureMath:math,pagedTransport:transport});initialized=true;},
   descriptors:{
    run(rgb,options={}){alive();checkAbort(life.signal);requireValue(initialized&&!contextClosed,'Paged descriptor source is not active');const signal=AbortSignal.any([life.signal,...(options.signal?[options.signal]:[])]),work=stage.run(rgb,{...options,signal});running.add(work);work.then(()=>running.delete(work),()=>running.delete(work));return work;},
    releaseCheckpoint:key=>stage?.releaseCheckpoint(key),checkpointSnapshot:()=>stage?.checkpointSnapshot()
   },
   unionHead:{
    run(pm,options={}){alive();checkAbort(life.signal);requireValue(initialized&&!contextClosed&&union,'Paged union source is not active');const signal=AbortSignal.any([life.signal,...(options.signal?[options.signal]:[])]),work=union.run(pm,{...options,signal});running.add(work);work.then(()=>running.delete(work),()=>running.delete(work));return work;},
    releaseCheckpoint:key=>union?.releaseCheckpoint(key),checkpointSnapshot:()=>union?.checkpointSnapshot()
   },
   snapshot(){return{closed:contextClosed,retired,initialized,running:running.size,done:{...done},retirementFailures:[...retirementFailures]};},
   dispose(){if(retired)return Promise.resolve();if(retiring)return retiring;contextClosed=true;life.abort();retiring=(async()=>{await Promise.allSettled([...running]);let failed=false,primary;for(const[name,owner]of[['union',union],['stage',stage],['math',math],['transport',transport]])if(!done[name])try{await ack(()=>owner?.dispose());done[name]=true;}catch(error){retirementFailures.push({owner:name,message:String(error?.message??error),code:error?.code??null});if(!failed){failed=true;primary=error;}}if(failed)throw primary;retired=true;})();void retiring.catch(()=>{retiring=null;});return retiring;}
  };contexts.set(bank,context);return context;
 };
 const release=async bank=>{const context=contexts.get(bank);if(!context)return;await context.dispose();if(contexts.get(bank)===context)contexts.delete(bank);};
 const releaseAll=async()=>{let failed=false,primary;for(const bank of [...contexts.keys()])try{await release(bank);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
 const forContext=async bank=>{alive();for(const [other,context]of [...contexts])if(other!==bank||context.snapshot().closed)await release(other);alive();let context=contexts.get(bank);if(!context){context=make(bank);try{context.initialize();}catch(error){try{await release(bank);}catch(cleanup){note(error,cleanup);}throw error;}}alive();return context;};
 const manager={
  async forBank(bank){alive();for(const [other,context]of [...contexts])if(other!==bank||context.snapshot().closed)await release(other);alive();let context=contexts.get(bank);if(!context){context=make(bank);try{context.initialize();}catch(error){try{await release(bank);}catch(cleanup){note(error,cleanup);}throw error;}}alive();return context.descriptors;},
  async forUnionBank(bank){requireValue(unionOptions&&bank?.modelSide===unionOptions.inputSide,'Matching large-grid union source options required');return(await forContext(bank)).unionHead;},
  release,releaseAll,
  snapshot(){return{closed,sources:contexts.size,contexts:[...contexts.values()].map(v=>v.snapshot())};},
  dispose(){if(closing)return closing;closed=true;closing=releaseAll();void closing.catch(()=>{closing=null;});return closing;}
 };onOwner(manager);return manager;
}
