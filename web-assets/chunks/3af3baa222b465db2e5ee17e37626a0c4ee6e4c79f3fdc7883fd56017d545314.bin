import "../../runtime-context.js?v=0.25.0";
import {requireValue} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// A row is borrowed until its source acknowledges release. Failed releases
// stay reachable; retries cannot retire a different concurrently active row.
export function createRgbRowRetirement(){
 const held=new Set(),failed=new Set(),pending=new Map();
 const release=view=>{
  if(!view||!held.has(view))return;
  if(pending.has(view))return pending.get(view);
  const task=Promise.resolve().then(()=>view.release()).then(()=>{held.delete(view);failed.delete(view);},error=>{failed.add(view);throw error;});
  pending.set(view,task);void task.finally(()=>{if(pending.get(view)===task)pending.delete(view);}).catch(()=>{});return task;
 };
 return{
  get hasLiveRows(){return held.size>0;},
  hold(view){requireValue(view&&typeof view.release==='function','Owned RGB row window required.');held.add(view);return view;},
  release,
  retry(){return retireCompositeOwners([...failed].map(view=>()=>release(view)));},
  dispose(){return retireCompositeOwners([...held].map(view=>()=>release(view)));}
 };
}
