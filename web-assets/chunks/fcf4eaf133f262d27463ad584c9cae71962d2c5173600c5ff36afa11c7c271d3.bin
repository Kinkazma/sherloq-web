import "../../runtime-context.js?v=0.24.0";
import {checkAbort,controlCheckpoint} from './errors.js';

/** Keep useful CPU credit across tiny reads, but start a fresh measurement for
 * every call. Time between reads and pending storage/child reads is excluded. */
export function createReadCooperation({clock=()=>performance.now(),yieldControl=controlCheckpoint,interval=8}={}){
 let cpu=0;
 return{begin(signal){let started=clock(),measuring=true,finished=false;
  const charge=()=>{if(!measuring||finished)return;const now=clock();cpu+=Math.max(0,now-started);started=now;};
  return{
   async checkpoint(){charge();checkAbort(signal);if(cpu>=interval){cpu=0;measuring=false;try{await yieldControl(signal);}finally{started=clock();measuring=true;}}checkAbort(signal);},
   async wait(operation){charge();let value;try{value=operation();}finally{charge();}if(!value?.then)return value;measuring=false;try{return await value;}finally{started=clock();measuring=true;}},
   finish(){charge();finished=true;}
  };
 }};
}
