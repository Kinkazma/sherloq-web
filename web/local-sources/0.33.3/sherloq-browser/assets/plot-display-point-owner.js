import {readPlotPoints} from './scatter-view.js?v=0.33.3';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
// Presentation arrays + WebGL buffers, not scientific tables. Existing captured
// parent financing is used; no child budget, full image copy or new RPC.
export async function readCanonicalPlotPoints(client,table,{valid,onOwner,onPeerUnavailable}={}){
 const n=Math.ceil(table.rowCount/Math.max(1,Math.ceil(table.rowCount/262144))),bytes=n*54+2*Math.min(65536,table.rowCount)*27+4096;
 if(!Number.isSafeInteger(bytes)||bytes>48*1024**2||typeof valid!=='function'||typeof onOwner!=='function'||typeof onPeerUnavailable!=='function')throw Error('Invalid bounded plot presentation admission.');
 const original=client.source;let points,grant,admission,reading,closing=false,invalid=false,flight;
 const current=()=>!closing&&!invalid&&client.source===original&&valid();
 const drop=()=>{if(points){points.values=points.displayColors=null;}points=null;};
 const owner={get points(){return points;},dispose(){if(flight)return flight;closing=true;const task=Promise.resolve().then(async()=>{await Promise.allSettled([admission,reading]);drop();await grant?.dispose();}).catch(primary=>{throw withRetirementOwner(primary,owner,primary);});flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}};
 const adopted=onOwner(owner);if(adopted===false||adopted===0||adopted&&typeof adopted.then==='function')throw Error('Plot presentation adoption must be synchronous.');
 try{admission=client.reserveRetainedHistogram(bytes,{onOwner:held=>{grant=held;return true;},onPeerUnavailable:event=>{invalid=true;onPeerUnavailable(event);drop();}});await admission;if(!current())throw Error('Plot display Original changed during admission.');
  reading=(async()=>{points=await readPlotPoints(table,(t,o,l)=>client.readTable(t,o,l,{displayColors:true}),{valid:current,displayColors:true});if(!points||!current())throw Error('Plot display Original changed during its read.');return points;})();await reading;return owner;
 }catch(primary){try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
}
