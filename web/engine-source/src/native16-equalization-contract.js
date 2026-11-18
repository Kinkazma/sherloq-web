import {equalizationPlan,equalizationState,equalizationMethods} from './equalization-settings.js';
import {requireValue} from './errors.js';

// No enumerable field, DTO or prefix-worker payload is added. Revalidating an
// Adjust parameter object retains the private stage via this module identity.
const ADJUST_EQUALIZATION=Symbol('native16-adjust-equalization');
const EQUALIZATION_CONSUMED=Symbol('native16-equalization-consumed');
export function native16AdjustEqualization(params){return params?.[ADJUST_EQUALIZATION]??null;}
export function native16EqualizationConsumed(record){return record?.[EQUALIZATION_CONSUMED]===true;}
export function markNative16EqualizationConsumed(record){
 requireValue(record&&typeof record==='object','A completed native equalization record is required.');
 Object.defineProperty(record,EQUALIZATION_CONSUMED,{value:true,enumerable:false});return record;
}
function frozenPlan(value){
 const state=Object.freeze({...value.state,values:Object.freeze([...value.state.values]),sherloq7c:Object.freeze({...value.state.sherloq7c})});
 const base={...value.base};if(Array.isArray(base.bounds))base.bounds=Object.freeze([...base.bounds]);
 return Object.freeze({...value,state,base:Object.freeze(base),finish:value.finish?Object.freeze({...value.finish}):null});
}
export function retainNative16AdjustEqualization(params,plan){
 requireValue(plan?.kind==='adjust','A native Adjust equalization stage is required.');
 const retained=frozenPlan({...plan,base:{...params,equalize:0},finish:{threshold:params.threshold,invert:params.invert}});
 Object.defineProperty(params,ADJUST_EQUALIZATION,{value:retained,enumerable:false});return params;
}

// This contract selects only the new native composite. A null7C result is not
// an admission: its existing external8-bit wrapper remains responsible for it.
export function native16CompositeEqualizationPlan(operation,params={}){
 if(!['inspection.adjust','inspection.magnifier','colors.pca'].includes(operation))return null;
 requireValue(params&&typeof params==='object'&&!Array.isArray(params),'Equalization parameters must be an object.');
 const retained=operation==='inspection.adjust'?native16AdjustEqualization(params):null;
 if(retained)return frozenPlan({...retained,base:{...params,equalize:0},finish:{threshold:params.threshold,invert:params.invert}});
 const serialized=Object.hasOwn(params,'equalization')?equalizationPlan(operation,params):null;
 if(operation==='inspection.adjust'){
  if(!serialized&&Object.hasOwn(params,'equalize'))requireValue(Number.isInteger(params.equalize)&&params.equalize>=0&&params.equalize<=5,'Invalid equalize.');
  const state=serialized?.state??equalizationState(undefined,params.equalize??0,operation);
  if(state.method==='none'||state.method==='sherloq7c')return null;
  const method=equalizationMethods.find(row=>row.id===state.method),value=state.values[equalizationMethods.indexOf(method)];
  const base={...params,equalize:0};delete base.equalization;
  return frozenPlan({kind:'adjust',base,method,value,channels:false,
   finish:{threshold:Object.hasOwn(params,'threshold')?params.threshold:255,invert:Object.hasOwn(params,'invert')?params.invert:false},state});
 }
 if(!serialized?.post||!serialized.method||serialized.state.method==='sherloq7c')return null;
 return frozenPlan({kind:'post',base:serialized.base,method:serialized.method,value:serialized.value,channels:serialized.channels,finish:serialized.finish,state:serialized.state});
}
