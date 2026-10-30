import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
/** A last release that has not received its ACK still owns the native value.
 * Reference removal is once-only; final retirement is coalesced and retryable. */
export function retainAutomaticElaValue(value,cleanup){
 let references=1,retiring,retired=false;
 const retire=()=>{
  if(references||retired)return retiring;if(retiring)return retiring;
  retiring=Promise.resolve().then(cleanup).then(()=>{retired=true;},error=>{retiring=undefined;throw error;});return retiring;
 };
 function lease(){let released=false;return{value,release(){if(!released){released=true;references--;}return retire();}};}
 return{...lease(),retain(){requireValue(references>0&&!retired,'ELA scientific resource disposed.');references++;return lease();}};
}
